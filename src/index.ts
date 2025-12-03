import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { default: Operator, ResourceEventType } = require('@dot-i/k8s-operator');
import type { ResourceEvent } from '@dot-i/k8s-operator';
import * as k8s from '@kubernetes/client-node';
import { NodeGroup, AutoscalerConfig } from './types.js';
import { AutoscalerReconciler } from './autoscaler.js';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌❌❌ UNHANDLED PROMISE REJECTION ❌❌❌');
  console.error('❌ Reason:', reason);
  console.error('❌ Reason type:', typeof reason);
  if (reason instanceof Error) {
    console.error('❌ Error message:', reason.message);
    console.error('❌ Error stack:', reason.stack);
  }
  console.error('❌ Promise:', promise);
  process.exit(1);
});

// Bun automatically loads .env file - no code needed!

// Allow self-signed certificates for development (disable in production!)
if (process.env.SKIP_TLS_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('⚠️  TLS certificate verification disabled (development mode)');
}

// Load configuration from environment variables
const config: AutoscalerConfig = {
  cpuThresholdHigh: parseFloat(process.env.CPU_THRESHOLD_HIGH || '80'),
  cpuThresholdLow: parseFloat(process.env.CPU_THRESHOLD_LOW || '30'),
  memoryThresholdHigh: parseFloat(process.env.MEMORY_THRESHOLD_HIGH || '80'),
  memoryThresholdLow: parseFloat(process.env.MEMORY_THRESHOLD_LOW || '30'),
  minNodes: parseInt(process.env.MIN_NODES || '1', 10),
  maxNodes: parseInt(process.env.MAX_NODES || '10', 10),
  reconcileIntervalSeconds: parseInt(process.env.RECONCILE_INTERVAL_SECONDS || '30', 10),
  cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS || '180', 10),
  targetNodeGroup: process.env.TARGET_NODEGROUP
};

console.log('🚀 Starting Clever Autoscaler Operator');
console.log('Configuration:', config);

// Custom logger to see what's happening
const logger = {
  debug: (msg: string) => console.log('[DEBUG]', msg),
  info: (msg: string) => console.log('[INFO]', msg),
  warn: (msg: string) => console.warn('[WARN]', msg),
  error: (msg: string) => console.error('[ERROR]', msg)
};

// Custom operator class to handle initialization
class AutoscalerOperator extends Operator {
  constructor() {
    super(logger);

    // Override kubeConfig to disable TLS verification if needed
    if (process.env.SKIP_TLS_VERIFY === 'true') {
      // Set skipTLSVerify on the current cluster
      const cluster = this.kubeConfig.getCurrentCluster();
      if (cluster) {
        (cluster as any).skipTLSVerify = true;
      }

      // Patch applyToHTTPSOptions to check skipTLSVerify (missing in the library)
      const originalApplyToHTTPSOptions = this.kubeConfig.applyToHTTPSOptions.bind(this.kubeConfig);
      this.kubeConfig.applyToHTTPSOptions = async (opts: any) => {
        const currentCluster = this.kubeConfig.getCurrentCluster();
        if (currentCluster && (currentCluster as any).skipTLSVerify) {
          // Set BEFORE calling original so it gets copied to agentOptions
          opts.rejectUnauthorized = false;
        }
        await originalApplyToHTTPSOptions(opts);
        return opts;
      };

      console.log('✅ TLS verification disabled for cluster');
    }
  }
  private autoscaler!: AutoscalerReconciler;
  private customObjectsApi!: k8s.CustomObjectsApi;

  protected async init(): Promise<void> {
    console.log('🔍 Operator started, watching NodeGroups...');

    try {
      // The Operator base class already loaded kubeConfig via loadFromDefault()
      // It respects KUBECONFIG env var automatically
      this.customObjectsApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);
      const coreApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
      const metricsClient = new k8s.Metrics(this.kubeConfig);

      console.log('✅ Kubernetes clients initialized');

      // Initialize autoscaler reconciler
      this.autoscaler = new AutoscalerReconciler(
        this.customObjectsApi,
        coreApi,
        metricsClient,
        config
      );

      console.log('✅ Autoscaler reconciler initialized');

      // Set up periodic reconciliation for all NodeGroups
      setInterval(async () => {
        try {
          console.log('\n⏰ Running periodic reconciliation...');

          // Use listClusterCustomObject properly
          const response = await this.customObjectsApi.listClusterCustomObject({
            group: 'api.clever-cloud.com',
            version: 'v1',
            plural: 'nodegroups'
          });

          const nodeGroups = (response.body?.items || response.items || []) as NodeGroup[];

          for (const nodeGroup of nodeGroups) {
            try {
              await this.autoscaler.reconcile(nodeGroup, ResourceEventType.Modified);
            } catch (error) {
              console.error(`Error reconciling ${nodeGroup.metadata?.name}:`, error);
            }
          }
        } catch (error) {
          console.error('Error in periodic reconciliation:', error);
        }
      }, config.reconcileIntervalSeconds * 1000);

      console.log('✅ Periodic reconciliation scheduled');

      // Watch NodeGroup resources
      // Note: this call blocks until the watch ends, so put it last
      console.log('🔍 Setting up watch for NodeGroups...');
      await this.watchResource(
        'api.clever-cloud.com',
        'v1',
        'nodegroups',
        async (event: ResourceEvent) => {
          try {
            console.log(`📦 NodeGroup event: ${event.type} - ${event.object.metadata?.name}`);
            await this.autoscaler.reconcile(event.object as NodeGroup, event.type);
          } catch (error) {
            console.error('Error in reconciliation:', error);
          }
        }
      );
    } catch (error) {
      console.error('❌ Error during operator initialization:', error);
      throw error;
    }
  }
}

// Initialize operator
const operator = new AutoscalerOperator();

// Start the operator
try {
  await operator.start();
  console.log('✅ Operator started successfully');
} catch (error) {
  console.error('❌ Failed to start operator:', error);
  process.exit(1);
}

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\n👋 Shutting down operator...');
  await operator.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
