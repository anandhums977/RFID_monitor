const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// MQTT Configuration
const MQTT_BROKER = 'mqtt://test.mosquitto.org:1883';
const MQTT_TOPIC_ALL = 'rfid/#';
const MQTT_CLIENT_ID = 'rfid_subscriber_nodejs';

const MQTT_OPTIONS = {
  clientId: MQTT_CLIENT_ID,
  reconnectPeriod: 1000,
  clean: true,
};

// Express setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public folder
app.use(express.static('public'));

// Store recent tag reads (keep last 100)
const tagHistory = [];
const MAX_HISTORY = 100;

// Connect to MQTT broker
console.log(`[SYSTEM] Connecting to MQTT broker at ${MQTT_BROKER}...`);
const mqttClient = mqtt.connect(MQTT_BROKER, MQTT_OPTIONS);

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected successfully to broker');
  console.log(`[MQTT] Subscribing to topic: ${MQTT_TOPIC_ALL}`);
  
  mqttClient.subscribe(MQTT_TOPIC_ALL, { qos: 1 }, (err) => {
    if (err) {
      console.error('[MQTT] Subscription error:', err);
    } else {
      console.log('[SYSTEM] Listening for RFID tag reads...\n');
    }
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const tagData = {
      gate: payload.gate || 'UNKNOWN',
      tagId: payload.tag_id || 'N/A',
      antenna: payload.antenna || 'N/A',
      datetime: payload.datetime || new Date().toISOString(),
      timestamp: Date.now()
    };

    console.log(`[${tagData.datetime}] [${tagData.gate}] Tag: ${tagData.tagId} | Antenna: ${tagData.antenna}`);

    // Add to history
    tagHistory.unshift(tagData);
    if (tagHistory.length > MAX_HISTORY) {
      tagHistory.pop();
    }

    // Broadcast to all connected clients
    io.emit('tagRead', tagData);
    
  } catch (err) {
    console.error(`[ERROR] Failed to parse JSON from topic ${topic}:`, err.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message);
  io.emit('mqttStatus', { connected: false, error: err.message });
});

mqttClient.on('close', () => {
  console.log('[MQTT] Disconnected from broker');
  io.emit('mqttStatus', { connected: false });
});

mqttClient.on('reconnect', () => {
  console.log('[MQTT] Attempting to reconnect...');
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected');
  
  // Send current history to new client
  socket.emit('history', tagHistory);
  socket.emit('mqttStatus', { connected: mqttClient.connected });
  
  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SYSTEM] Web server running at http://localhost:${PORT}`);
  console.log('[SYSTEM] Open your browser to view the dashboard');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SYSTEM] Stopping server...');
  mqttClient.end();
  server.close();
  process.exit(0);
});
