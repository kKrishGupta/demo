/**
 * ActionFlow AI — Universal Connector Registry (V5 Master)
 *
 * Provides a connector-independent abstraction layer.
 * Allows arbitrary enterprise integrations (Salesforce, SAP, Jira, ServiceNow, Google, WhatsApp, etc.)
 * to be registered, validated, evaluated, and executed without rewriting the central AI engine.
 */

export class ConnectorRegistry {
  constructor() {
    this._connectors = new Map();
    this._initStandardConnectors();
  }

  registerConnector(connector) {
    if (!connector?.connectorId) {
      throw new Error('Connector must have a connectorId');
    }
    const def = {
      connectorId: connector.connectorId,
      name: connector.name || connector.connectorId,
      description: connector.description || '',
      supportedOperations: new Set((connector.supportedOperations || []).map(o => String(o).toUpperCase())),
      inputSchema: connector.inputSchema || {},
      outputSchema: connector.outputSchema || {},
      authRequirements: connector.authRequirements || { type: 'NONE' },
      permissionScopes: connector.permissionScopes || [],
      rateLimits: connector.rateLimits || { maxRequestsPerMinute: 60 },
      retryPolicy: connector.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 },
      idempotencySupport: Boolean(connector.idempotencySupport),
      healthStatus: connector.healthStatus || 'HEALTHY',
      errorMapping: connector.errorMapping || {},
      isMock: Boolean(connector.isMock),
      execute: connector.execute || (async (action) => ({
        success: true,
        connectorId: connector.connectorId,
        operation: action.operation,
        status: connector.isMock ? 'SIMULATED' : 'EXECUTED',
        timestamp: new Date().toISOString()
      }))
    };

    this._connectors.set(connector.connectorId, def);
    return def;
  }

  getConnector(connectorId) {
    return this._connectors.get(connectorId) || null;
  }

  listConnectors() {
    return Array.from(this._connectors.values()).map(c => ({
      connectorId: c.connectorId,
      name: c.name,
      supportedOperations: Array.from(c.supportedOperations),
      authRequirements: c.authRequirements,
      rateLimits: c.rateLimits,
      idempotencySupport: c.idempotencySupport,
      healthStatus: c.healthStatus,
      isMock: c.isMock
    }));
  }

  validateActionForConnector(action) {
    const connector = this.getConnector(action.destination);
    if (!connector) {
      return {
        isValid: false,
        error: `Unknown destination connector: "${action.destination}"`,
        failingStage: 'DESTINATION_ROUTING'
      };
    }

    const op = String(action.operation || '').toUpperCase();
    if (!connector.supportedOperations.has(op)) {
      return {
        isValid: false,
        error: `Connector "${action.destination}" does not support operation "${op}". Supported: ${Array.from(connector.supportedOperations).join(', ')}`,
        failingStage: 'OPERATION_CLASSIFICATION'
      };
    }

    return { isValid: true, connector };
  }

  async executeThroughConnector(action, context = {}) {
    const validation = this.validateActionForConnector(action);
    if (!validation.isValid) {
      return {
        success: false,
        status: 'FAILED',
        error: validation.error,
        failingStage: validation.failingStage
      };
    }

    const connector = validation.connector;
    try {
      const res = await connector.execute(action, context);
      return {
        success: res.success !== false,
        status: res.status || 'COMPLETED',
        connectorId: connector.connectorId,
        isMock: connector.isMock,
        result: res
      };
    } catch (err) {
      const mappedCode = connector.errorMapping[err.code] || 'CONNECTOR_EXECUTION_ERROR';
      return {
        success: false,
        status: 'FAILED',
        errorCode: mappedCode,
        error: err.message,
        connectorId: connector.connectorId
      };
    }
  }

  _initStandardConnectors() {
    // 1. Google Calendar
    this.registerConnector({
      connectorId: 'GOOGLE_CALENDAR',
      name: 'Google Calendar API',
      supportedOperations: ['SCHEDULE', 'RESCHEDULE', 'CANCEL', 'READ', 'CREATE', 'UPDATE', 'DELETE'],
      idempotencySupport: true,
      authRequirements: { type: 'OAUTH2', scope: 'calendar.events' }
    });

    // 2. WhatsApp Business
    this.registerConnector({
      connectorId: 'WHATSAPP',
      name: 'WhatsApp Business Cloud API',
      supportedOperations: ['SEND', 'NOTIFY', 'READ', 'RECEIVE'],
      idempotencySupport: true,
      authRequirements: { type: 'BEARER_TOKEN' }
    });

    // 3. Enterprise Jira
    this.registerConnector({
      connectorId: 'JIRA',
      name: 'Atlassian Jira Software',
      supportedOperations: ['CREATE', 'ASSIGN', 'UPDATE', 'SEARCH', 'COMPLETE', 'TRANSITION', 'READ'],
      idempotencySupport: true,
      authRequirements: { type: 'API_TOKEN' }
    });

    // 4. Task Manager Internal
    this.registerConnector({
      connectorId: 'TASK_MANAGER',
      name: 'ActionFlow Internal Task Engine',
      supportedOperations: ['CREATE', 'ASSIGN', 'UPDATE', 'COMPLETE', 'DELETE', 'READ', 'REMIND'],
      idempotencySupport: true,
      authRequirements: { type: 'SESSION_CONTEXT' }
    });

    // 5. Shopping / Inventory List
    this.registerConnector({
      connectorId: 'SHOPPING_LIST',
      name: 'ActionFlow Procurement & Shopping List',
      supportedOperations: ['CREATE', 'UPDATE', 'DELETE', 'READ', 'COMPLETE'],
      idempotencySupport: true,
      authRequirements: { type: 'NONE' }
    });

    // 6. Salesforce CRM
    this.registerConnector({
      connectorId: 'SALESFORCE_CRM',
      name: 'Salesforce Enterprise CRM',
      supportedOperations: ['CREATE', 'UPDATE', 'READ', 'SEARCH', 'ASSIGN', 'NOTIFY'],
      idempotencySupport: true,
      authRequirements: { type: 'OAUTH2' }
    });

    // 7. ServiceNow ITSM
    this.registerConnector({
      connectorId: 'SERVICENOW',
      name: 'ServiceNow Incident Management',
      supportedOperations: ['CREATE', 'ESCALATE', 'UPDATE', 'RESOLVE', 'ASSIGN', 'MONITOR'],
      idempotencySupport: true,
      authRequirements: { type: 'OAUTH2' }
    });

    // 8. SAP Procurement / ERP
    this.registerConnector({
      connectorId: 'SAP_ERP',
      name: 'SAP S/4HANA Procurement & Supply Chain',
      supportedOperations: ['CREATE', 'APPROVE', 'REJECT', 'TRANSFER', 'READ', 'VALIDATE'],
      idempotencySupport: true,
      authRequirements: { type: 'MTLS_CERT' }
    });

    // 9. Workday HRIS
    this.registerConnector({
      connectorId: 'WORKDAY_HR',
      name: 'Workday Human Capital Management',
      supportedOperations: ['CREATE', 'UPDATE', 'READ', 'APPROVE', 'TRANSFER'],
      idempotencySupport: true,
      authRequirements: { type: 'OAUTH2' }
    });

    // 10. Meeting Intelligence & Recorder
    this.registerConnector({
      connectorId: 'MEETING_RECORDER',
      name: 'ActionFlow Industrial Meeting & Telemetry Recorder',
      supportedOperations: ['RECORD', 'MONITOR', 'ANALYZE', 'GENERATE', 'COMPLETE'],
      idempotencySupport: true,
      authRequirements: { type: 'DEVICE_AUTHORIZATION' }
    });

    // 11. Generic Custom Webhook API
    this.registerConnector({
      connectorId: 'CUSTOM_WEBHOOK',
      name: 'Enterprise Webhook Automation',
      supportedOperations: ['SEND', 'NOTIFY', 'UPLOAD', 'DOWNLOAD', 'CUSTOM'],
      idempotencySupport: true,
      authRequirements: { type: 'WEBHOOK_SIGNATURE' }
    });
  }
}

export const connectorRegistry = new ConnectorRegistry();

