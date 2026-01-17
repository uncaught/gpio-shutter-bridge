// Generated with the help of AI based on https://www.home-assistant.io/integrations/mqtt/

/**
 * Device information for MQTT discovery
 */
export interface MqttDevice {
  /** List of identifiers for the device */
  identifiers: string | string[];
  /** Name of the device */
  name?: string;
  /** Manufacturer of the device */
  manufacturer?: string;
  /** Model of the device */
  model?: string;
  /** Serial number of the device */
  serial_number?: string;
  /** Software version of the device */
  sw_version?: string;
  /** Hardware version of the device */
  hw_version?: string;
  /** Configuration URL for the device */
  configuration_url?: string;
  /** Connections of the device (e.g., [["mac", "02:5b:26:a8:dc:12"]]) */
  connections?: [string, string][];
  /** Suggested area for the device */
  suggested_area?: string;
  /** URL to a webpage that can manage the device */
  via_device?: string;
}

/**
 * Origin information for MQTT discovery
 */
export interface MqttOrigin {
  /** Name of the origin */
  name: string;
  /** Software version */
  sw_version?: string;
  /** Support URL */
  support_url?: string;
}

/**
 * Availability configuration for MQTT entities
 */
export interface MqttAvailability {
  /** MQTT topic subscribed to receive availability (online/offline) updates */
  topic: string;
  /** Payload that represents the available state */
  payload_available?: string;
  /** Payload that represents the unavailable state */
  payload_not_available?: string;
  /** Template to extract value from availability topic */
  value_template?: string;
}

/**
 * MQTT Cover component configuration for auto-discovery
 * @see https://www.home-assistant.io/integrations/cover.mqtt/
 */
export interface MqttCoverConfig {
  platform: 'cover';

  /** Name of the cover entity */
  name?: string;
  /** Unique ID for the entity (required for discovery) */
  unique_id: string;
  /** Device information */
  device?: MqttDevice;
  /** Origin information */
  origin?: MqttOrigin;

  // Availability configuration
  /** Single availability topic or array of availability configurations */
  availability?: MqttAvailability | MqttAvailability[];
  /** MQTT topic subscribed to receive availability (online/offline) updates */
  availability_topic?: string;
  /** Payload that represents the available state */
  payload_available?: string;
  /** Payload that represents the unavailable state */
  payload_not_available?: string;
  /** Availability mode (all, any, latest) */
  availability_mode?: 'all' | 'any' | 'latest';
  /** Template to extract value from availability topic */
  availability_template?: string;

  // Command topics
  /** MQTT topic to publish commands (open/close/stop) */
  command_topic: string;
  /** MQTT topic to set the position */
  set_position_topic?: string;
  /** MQTT topic to set the tilt */
  tilt_command_topic?: string;

  // State topics
  /** MQTT topic subscribed to receive state updates */
  state_topic?: string;
  /** MQTT topic for position updates */
  position_topic?: string;
  /** MQTT topic for tilt updates */
  tilt_status_topic?: string;

  // Payloads
  /** Payload to open the cover */
  payload_open?: string;
  /** Payload to close the cover */
  payload_close?: string;
  /** Payload to stop the cover */
  payload_stop?: string;

  // State values
  /** State value for open state */
  state_open?: string;
  /** State value for closed state */
  state_closed?: string;
  /** State value for opening state */
  state_opening?: string;
  /** State value for closing state */
  state_closing?: string;
  /** State value for stopped state */
  state_stopped?: string;

  // Position configuration
  /** Minimum position value (default: 0) */
  position_closed?: number;
  /** Maximum position value (default: 100) */
  position_open?: number;

  // Tilt configuration
  /** Minimum tilt value (default: 0) */
  tilt_min?: number;
  /** Maximum tilt value (default: 100) */
  tilt_max?: number;
  /** Payload to open the tilt */
  tilt_opened_value?: number;
  /** Payload to close the tilt */
  tilt_closed_value?: number;
  /** Inverts the tilt values */
  tilt_invert_state?: boolean;

  // Templates
  /** Template to extract position from position_topic */
  position_template?: string;
  /** Template to extract state from state_topic */
  value_template?: string;
  /** Template to extract tilt from tilt_status_topic */
  tilt_status_template?: string;

  // Device class
  /** Type of cover (awning, blind, curtain, damper, door, garage, gate, shade, shutter, window) */
  device_class?:
    | 'awning'
    | 'blind'
    | 'curtain'
    | 'damper'
    | 'door'
    | 'garage'
    | 'gate'
    | 'shade'
    | 'shutter'
    | 'window';

  // Behavior options
  /** Flag that defines if cover works in optimistic mode (default: true if no state_topic) */
  optimistic?: boolean;
  /** QoS level for commands */
  qos?: 0 | 1 | 2;
  /** If the published message should have the retain flag set */
  retain?: boolean;
  /** Defines the encoding of the payloads received and published messages */
  encoding?: string;
  /** Icon for the entity */
  icon?: string;
  /** Category of the entity */
  entity_category?: 'config' | 'diagnostic';
  /** Flag which defines if the entity should be enabled when first added */
  enabled_by_default?: boolean;
  /** Object ID for entity registry */
  object_id?: string;
}

/**
 * Complete MQTT Device Auto-Discovery Payload
 * Used for homeassistant/device/<device_id>/config topic
 */
export interface MqttDeviceDiscoveryPayload {
  /** Device information */
  device: MqttDevice;
  /** Origin information */
  origin?: MqttOrigin;
  /** Availability topic for the device */
  availability_topic?: string;
  /** Payload that represents the available state */
  payload_available?: string;
  /** Payload that represents the unavailable state */
  payload_not_available?: string;
  /** Components (entities) associated with this device */
  components: Record<string, MqttCoverConfig>;
}
