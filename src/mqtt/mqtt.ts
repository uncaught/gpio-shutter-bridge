import mqtt, {type IClientPublishOptions, type IClientOptions} from 'mqtt';
import {ShutterState, ShutterInterface, isShutterWithState, isShutterWithPosition} from '../Shutter/Shutter.js';
import {MqttDeviceDiscoveryPayload, MqttCoverConfig} from './interfaces.js';
import type {OnDispose} from '../runtime.js';

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
  onDispose: OnDispose,
  {url, ...mqttOpts}: { url: string } & IClientOptions,
  namespace: string = 'shutter', //must be unique if you have multiple instances of this program running
): void {
  const shuttersById = new Map<string, ShutterInterface>(shutters.map((s) => [s.ident, s]));

  validateNamespacePart(namespace);

  const ns1 = namespace;
  const fullNs = `${ns0}/${ns1}`;
  const deviceId = `${ns0}-${ns1}`;
  const deviceAvailabilityTopic = `${fullNs}/-/availability`;

  const client = mqtt.connect(url, {...mqttOpts, clientId: fullNs});

  const publish = (topic: string, message: string | Buffer, opts?: IClientPublishOptions): void => {
    console.log('MQTT publish', topic, message, opts);
    client.publish(topic, message, opts);
  };

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

      const subTopic = parts[3];
      if (subTopic === 'set') {
        if (payload === 'open') {
          shutter.open();
        } else if (payload === 'close') {
          shutter.close();
        } else if (payload === 'stop') {
          shutter.stop();
        }
      } else if (subTopic === 'set-position' && isShutterWithPosition(shutter)) {
        shutter.setPosition(parseInt(payload));
      }
    }
  });

  client.on('connect', () => {
    console.log('MQTT connected');
    client.subscribe(`${fullNs}/+/set`);
    client.subscribe(`${fullNs}/+/set-position`);

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
            publish(`${shutterNs}/state`, {
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

      if (isShutterWithPosition(shutter)) {
        const publishPosition = (position: number) => {
          publish(`${shutterNs}/position`, position.toString(), {retain: true});
        };
        publishPosition(shutter.getPosition());
        shutter.onPositionChange(publishPosition);

        autoDiscoveryComponent.optimistic = false;
        autoDiscoveryComponent.position_open = 100;
        autoDiscoveryComponent.position_closed = 0;
        autoDiscoveryComponent.position_topic = `${shutterNs}/position`;
        autoDiscoveryComponent.set_position_topic = `${shutterNs}/set-position`;
      }
    }

    publish(`homeassistant/device/${deviceId}/config`, JSON.stringify(autoDiscoveryPayload), {retain: true});
    publish(deviceAvailabilityTopic, 'online', {retain: true});
  });

  onDispose(async () => {
    publish(deviceAvailabilityTopic, 'offline', {retain: true});
    await client.endAsync();
  });
}
