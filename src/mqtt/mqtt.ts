import mqtt from 'mqtt';
import {ShutterState, ShutterInterface, isShutterWithState} from '../Shutter/Shutter.js';
import {MqttDeviceDiscoveryPayload, MqttCoverConfig} from './interfaces.js';

// @see https://www.home-assistant.io/integrations/mqtt
// @see https://www.home-assistant.io/integrations/cover.mqtt/
// @see https://www.home-assistant.io/integrations/cover/

const ns0 = 'uncaught-gpio-shutter-bridge';

function validateNamespacePart(str: string) {
  if (!/[a-zA-Z][a-zA-Z0-9_-]*/.test(str)) {
    throw new Error(`Invalid string for namespace: ${str}`);
  }
}

export function initMqtt(
  shutters: readonly ShutterInterface[],
  {url}: { url: string },
  namespace: string = 'shutter', //must be unique if you have multiple instances of this program running
): () => Promise<void> {
  const shuttersById = new Map<string, ShutterInterface>(shutters.map((s) => [s.ident, s]));

  validateNamespacePart(namespace);

  const ns1 = namespace;
  const fullNs = `${ns0}/${ns1}`;
  const deviceId = `${ns0}-${ns1}`;
  const deviceAvailabilityTopic = `${fullNs}/-/availability`;

  const client = mqtt.connect(url, {
    clientId: fullNs,
    rejectUnauthorized: false, // self-signed certificate
  });

  client.on('connect', () => {
    console.log('MQTT connected');
    client.subscribe(`${fullNs}/+/set`);
  });

  client.on('error', (err) => {
    console.error(err);
  });

  client.on('message', (topic, payloadBuffer) => {
    const parts = topic.split('/');
    const payload = payloadBuffer.toString();
    console.log('MQTT message', topic, payload);

    if (parts[0] === ns0 && parts[1] === ns1) {
      const ident = parts[2];

      const shutter = shuttersById.get(ident ?? '');
      if (!shutter) {
        return;
      }

      if (payload === 'open') {
        shutter.open();
      } else if (payload === 'close') {
        shutter.close();
      } else if (payload === 'stop') {
        shutter.stop();
      }
    }
  });

  const autoDiscoveryPayload: MqttDeviceDiscoveryPayload = {
    availability_topic: deviceAvailabilityTopic,
    components: {},
    device: {
      identifiers: deviceId,
      name: 'GPIO Shutter Bridge',
      manufacturer: 'uncaught',
      model: 'GPIO Shutter',
    },
    origin: {
      name: ns0,
      sw_version: '1.1.0',
      support_url: 'https://github.com/uncaught/gpio-shutter-bridge',
    },
    payload_available: 'online',
    payload_not_available: 'offline',
  };

  for (const shutter of shutters) {
    validateNamespacePart(shutter.ident);

    const shutterNs = `${fullNs}/${shutter.ident}`;

    //Auto-discovery:
    const objectId = `${deviceId}-${shutter.ident}`;
    const autoDiscoveryComponent: MqttCoverConfig = {
      command_topic: `${shutterNs}/set`,
      device_class: 'shutter', //see https://www.home-assistant.io/integrations/cover/#device-class
      name: `Shutter ${shutter.ident.replaceAll(/_/g, ' ')}`,
      optimistic: true,
      payload_close: 'close',
      payload_open: 'open',
      payload_stop: 'stop',
      platform: 'cover',
      unique_id: objectId,
    };
    autoDiscoveryPayload.components[objectId] = autoDiscoveryComponent;

    if (isShutterWithState(shutter)) {
      const publishState = (state: ShutterState) => {
        if (state !== 'stopping' && state !== 'unknown') {
          client.publish(`${shutterNs}/state`, {
            'closed': 'closed',
            'closing': 'closing',
            'in-between': 'stopped',
            'open': 'open',
            'opening': 'opening',
          }[state], {retain: true});
        }
      };
      publishState(shutter.getState());
      shutter.onStateChange(publishState);

      autoDiscoveryComponent.optimistic = false;
      autoDiscoveryComponent.state_closed = 'closed';
      autoDiscoveryComponent.state_closing = 'closing';
      autoDiscoveryComponent.state_open = 'open';
      autoDiscoveryComponent.state_opening = 'opening';
      autoDiscoveryComponent.state_stopped = 'stopped';
      autoDiscoveryComponent.state_topic = `${shutterNs}/state`;
    }
  }

  client.publish(`homeassistant/device/${deviceId}/config`, JSON.stringify(autoDiscoveryPayload), {retain: true});
  client.publish(deviceAvailabilityTopic, 'online', {retain: true});

  return async () => {
    client.publish(deviceAvailabilityTopic, 'offline', {retain: true});
    await client.endAsync();
  };
}
