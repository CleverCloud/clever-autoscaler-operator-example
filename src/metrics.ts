import * as k8s from '@kubernetes/client-node';

export interface NodeMetrics {
  nodeName: string;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
}

export class MetricsCollector {
  private metricsClient: k8s.Metrics;
  private coreApi: k8s.CoreV1Api;

  constructor(metricsClient: k8s.Metrics, coreApi: k8s.CoreV1Api) {
    this.metricsClient = metricsClient;
    this.coreApi = coreApi;
  }

  /**
   * Get CPU and memory usage for nodes matching a label selector
   */
  async getNodeGroupMetrics(labelSelector?: string): Promise<NodeMetrics[]> {
    try {
      // Get node metrics from metrics-server
      const nodeMetricsResponse = await this.metricsClient.getNodeMetrics();
      const nodeMetrics = nodeMetricsResponse.items;

      // Get node capacity/allocatable resources
      const nodesResponse = await this.coreApi.listNode();
      const nodes = (nodesResponse as any).body?.items || nodesResponse.items || [];

      interface NodeCapacity {
        cpuCapacity: number;
        memoryCapacity: number;
      }

      const nodeCapacityMap = new Map<string, NodeCapacity>(
        nodes.map((node: k8s.V1Node) => [
          node.metadata?.name || '',
          {
            cpuCapacity: this.parseCpu(node.status?.allocatable?.cpu || '0'),
            memoryCapacity: this.parseMemory(node.status?.allocatable?.memory || '0')
          }
        ])
      );

      // Calculate usage percentages
      return nodeMetrics
        .filter(metric => nodeCapacityMap.has(metric.metadata?.name || ''))
        .map(metric => {
          const nodeName = metric.metadata?.name || '';
          const capacity = nodeCapacityMap.get(nodeName)!;

          const cpuUsage = this.parseCpu(metric.usage?.cpu || '0');
          const memoryUsage = this.parseMemory(metric.usage?.memory || '0');

          return {
            nodeName,
            cpuUsagePercent: (cpuUsage / capacity.cpuCapacity) * 100,
            memoryUsagePercent: (memoryUsage / capacity.memoryCapacity) * 100
          };
        });
    } catch (error) {
      console.error('Error collecting metrics:', error);
      return [];
    }
  }

  /**
   * Parse CPU values (supports 'n' nanocores, 'm' millicores, or plain cores)
   */
  private parseCpu(cpu: string): number {
    if (cpu.endsWith('n')) {
      return parseFloat(cpu) / 1_000_000_000;
    } else if (cpu.endsWith('m')) {
      return parseFloat(cpu) / 1000;
    }
    return parseFloat(cpu);
  }

  /**
   * Parse memory values (supports Ki, Mi, Gi, etc.)
   */
  private parseMemory(memory: string): number {
    const units: Record<string, number> = {
      Ki: 1024,
      Mi: 1024 ** 2,
      Gi: 1024 ** 3,
      Ti: 1024 ** 4,
      K: 1000,
      M: 1000 ** 2,
      G: 1000 ** 3,
      T: 1000 ** 4
    };

    for (const [suffix, multiplier] of Object.entries(units)) {
      if (memory.endsWith(suffix)) {
        return parseFloat(memory) * multiplier;
      }
    }
    return parseFloat(memory);
  }

  /**
   * Calculate average metrics across nodes
   */
  calculateAverage(metrics: NodeMetrics[]): { avgCpu: number; avgMemory: number } {
    if (metrics.length === 0) {
      return { avgCpu: 0, avgMemory: 0 };
    }

    const sum = metrics.reduce(
      (acc, m) => ({
        cpu: acc.cpu + m.cpuUsagePercent,
        memory: acc.memory + m.memoryUsagePercent
      }),
      { cpu: 0, memory: 0 }
    );

    return {
      avgCpu: sum.cpu / metrics.length,
      avgMemory: sum.memory / metrics.length
    };
  }
}
