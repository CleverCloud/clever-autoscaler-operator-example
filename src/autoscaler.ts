import { ResourceEventType } from '@dot-i/k8s-operator';
import * as k8s from '@kubernetes/client-node';
import { NodeGroup, AutoscalerConfig } from './types.js';
import { MetricsCollector } from './metrics.js';

export class AutoscalerReconciler {
  private customObjectsApi: k8s.CustomObjectsApi;
  private metricsCollector: MetricsCollector;
  private config: AutoscalerConfig;
  private lastScaleTime = new Map<string, number>();

  constructor(
    customObjectsApi: k8s.CustomObjectsApi,
    coreApi: k8s.CoreV1Api,
    metricsClient: k8s.Metrics,
    config: AutoscalerConfig
  ) {
    this.customObjectsApi = customObjectsApi;
    this.metricsCollector = new MetricsCollector(metricsClient, coreApi);
    this.config = config;
  }

  async reconcile(nodeGroup: NodeGroup, eventType: ResourceEventType): Promise<void> {
    const name = nodeGroup.metadata?.name;
    if (!name) {
      console.log('NodeGroup has no name, skipping');
      return;
    }

    // Check if we should only reconcile a specific NodeGroup
    if (this.config.targetNodeGroup && name !== this.config.targetNodeGroup) {
      // Only log debug to avoid spamming logs
      // console.debug(`Skipping NodeGroup ${name} (target is ${this.config.targetNodeGroup})`);
      return;
    }

    console.log(`Reconciling NodeGroup: ${name} (event: ${eventType})`);

    // Skip if deleted
    if (eventType === ResourceEventType.Deleted) {
      console.log(`NodeGroup ${name} deleted, removing from tracking`);
      this.lastScaleTime.delete(name);
      return;
    }

    // Check if in cooldown period
    const lastScale = this.lastScaleTime.get(name) || 0;
    const now = Date.now();
    if (now - lastScale < this.config.cooldownSeconds * 1000) {
      console.log(`NodeGroup ${name} is in cooldown period, skipping`);
      return;
    }

    // Get current node count
    const currentCount = nodeGroup.spec.nodeCount;
    const statusCount = nodeGroup.status?.nodeCount ?? currentCount;

    console.log(`Current spec.nodeCount: ${currentCount}, status.nodeCount: ${statusCount}`);

    // If nodes are still being provisioned, wait
    if (statusCount < currentCount) {
      console.log(`Nodes still being provisioned (${statusCount}/${currentCount}), waiting...`);
      return;
    }

    // Get metrics for nodes in this NodeGroup
    // Assuming NodeGroup controller labels nodes with something like:
    // nodegroup.api.clever-cloud.com/name=<nodegroup-name>
    const labelSelector = `nodegroup.api.clever-cloud.com/name=${name}`;
    const metrics = await this.metricsCollector.getNodeGroupMetrics(labelSelector);

    if (metrics.length === 0) {
      console.log(`No metrics available for NodeGroup ${name}, skipping`);
      return;
    }

    const { avgCpu, avgMemory } = this.metricsCollector.calculateAverage(metrics);
    console.log(`Metrics for ${name}: avgCPU=${avgCpu.toFixed(2)}%, avgMemory=${avgMemory.toFixed(2)}%`);

    // Decide whether to scale
    let desiredCount = currentCount;

    // Scale up if either CPU or memory is high
    if (
      (avgCpu > this.config.cpuThresholdHigh || avgMemory > this.config.memoryThresholdHigh) &&
      currentCount < this.config.maxNodes
    ) {
      desiredCount = currentCount + 1;
      console.log(`📈 Scaling UP: ${currentCount} -> ${desiredCount} (CPU: ${avgCpu.toFixed(2)}%, Mem: ${avgMemory.toFixed(2)}%)`);
    }
    // Scale down if both CPU and memory are low
    else if (
      avgCpu < this.config.cpuThresholdLow &&
      avgMemory < this.config.memoryThresholdLow &&
      currentCount > this.config.minNodes
    ) {
      desiredCount = currentCount - 1;
      console.log(`📉 Scaling DOWN: ${currentCount} -> ${desiredCount} (CPU: ${avgCpu.toFixed(2)}%, Mem: ${avgMemory.toFixed(2)}%)`);
    } else {
      console.log(`✅ No scaling needed (CPU: ${avgCpu.toFixed(2)}%, Mem: ${avgMemory.toFixed(2)}%)`);
    }

    // Apply scaling if needed
    if (desiredCount !== currentCount) {
      await this.scaleNodeGroup(name, desiredCount);
      this.lastScaleTime.set(name, now);
    }
  }

  private async scaleNodeGroup(name: string, desiredCount: number): Promise<void> {
    try {
      const patch = [
        {
          op: 'replace',
          path: '/spec/nodeCount',
          value: desiredCount
        }
      ];

      // Cast to any to avoid TypeScript confusion with method overloads
      await (this.customObjectsApi as any).patchClusterCustomObject({
        group: 'api.clever-cloud.com',
        version: 'v1',
        plural: 'nodegroups',
        name: name,
        body: patch,
        options: {
          headers: { 'Content-Type': 'application/json-patch+json' }
        }
      });

      console.log(`✅ Successfully scaled NodeGroup ${name} to ${desiredCount} nodes`);
    } catch (error) {
      console.error(`Failed to scale NodeGroup ${name}:`, error);
    }
  }

  getConfig(): AutoscalerConfig {
    return this.config;
  }

  updateConfig(newConfig: Partial<AutoscalerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Autoscaler config updated:', this.config);
  }
}
