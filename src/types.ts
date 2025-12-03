import { KubernetesObject } from '@kubernetes/client-node';

export interface NodeGroupSpec {
  flavor?: 'XS' | 'xs' | 'S' | 's' | 'M' | 'm' | 'L' | 'l' | 'XL' | 'xl';
  id?: string;
  nodeCount: number;
}

export interface NodeGroupStatus {
  nodeCount?: number;
}

export interface NodeGroup extends KubernetesObject {
  apiVersion: 'api.clever-cloud.com/v1';
  kind: 'NodeGroup';
  spec: NodeGroupSpec;
  status?: NodeGroupStatus;
}

export interface AutoscalerConfig {
  cpuThresholdHigh: number;  // Scale up when CPU > this (%)
  cpuThresholdLow: number;   // Scale down when CPU < this (%)
  memoryThresholdHigh: number;  // Scale up when memory > this (%)
  memoryThresholdLow: number;   // Scale down when memory < this (%)
  minNodes: number;
  maxNodes: number;
  reconcileIntervalSeconds: number;
  cooldownSeconds: number;  // Wait this long after scaling before scaling again
  targetNodeGroup?: string; // Optional: only autoscale this specific NodeGroup
}
