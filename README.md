![Clever Cloud logo](/assets/clever-cloud-logo.png)

# Clever Autoscaler Operator

[![Clever Cloud - PaaS](https://img.shields.io/badge/Clever%20Cloud-PaaS-orange?logo=clevercloud)](https://clever-cloud.com)
[![Node.js](https://img.shields.io/badge/Node.js-18+-3776AB?logo=nodejs&logoColor=white)](https://nodejs.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.28+-3776AB?logo=kubernetes&logoColor=white)](https://kubernetes.io/)

A custom Kubernetes operator that automatically scales Clever Cloud Managed Kubernetes NodeGroups based on CPU and memory usage metrics.

> [!IMPORTANT]
> This project is an **example** of an autoscaler. It demonstrates the philosophy and patterns you can use to create your own operators for autoscaling, based on your specific needs.
>
> **Please do not use this example as-is for production.** It is provided without any guarantees.

## Features

- Monitors CPU and memory usage across nodes in NodeGroups
- Automatically scales NodeGroups up when resource usage is high
- Scales down when resource usage is low
- Configurable thresholds and scaling parameters
- Cooldown period to prevent scaling thrashing
- Works with Clever Cloud's NodeGroup CRD
- Real-time event-driven reconciliation via Kubernetes watch
- Periodic reconciliation as a safety net

## Prerequisites

- Node.js 18+ (runtime)

- Access to a Clever Cloud Managed Kubernetes cluster
- NodeGroup CRD installed (`nodegroups.api.clever-cloud.com`)
- Kubernetes metrics-server installed and running

## Installation
```bash
npm ci
```



## Configuration

Configure the operator using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `CPU_THRESHOLD_HIGH` | Scale up when CPU usage exceeds this % | `80` |
| `CPU_THRESHOLD_LOW` | Scale down when CPU usage is below this % | `30` |
| `MEMORY_THRESHOLD_HIGH` | Scale up when memory usage exceeds this % | `80` |
| `MEMORY_THRESHOLD_LOW` | Scale down when memory usage is below this % | `30` |
| `MIN_NODES` | Minimum number of nodes to maintain | `1` |
| `MAX_NODES` | Maximum number of nodes allowed | `10` |
| `RECONCILE_INTERVAL_SECONDS` | How often to check metrics | `30` |
| `COOLDOWN_SECONDS` | Wait time after scaling before scaling again | `180` |
| `KUBECONFIG` | Path to kubeconfig file | Uses default kubeconfig |
| `SKIP_TLS_VERIFY` | Disable TLS certificate verification (development only) | `false` |
| `TARGET_NODEGROUP` | Optional: Name of a specific NodeGroup to watch. If not set, watches all. | `undefined` |

## Usage

### Install Dependencies

```bash
npm ci
```

### Development Mode

```bash
# Set the KUBECONFIG environment variable
export KUBECONFIG=./kubeconfig.yml

# For development clusters with self-signed certificates
export SKIP_TLS_VERIFY=true

# Run in development mode with hot reload
npm run dev
```

### Production Mode

```bash
export KUBECONFIG=./kubeconfig.yml
npm start
```

### With Custom Configuration

Create a `.env` file (or copy from `.env.example`):

```bash
cp .env.example .env
# Edit .env with your configuration
```

Or set environment variables:

```bash
export KUBECONFIG=./kubeconfig.yml
export CPU_THRESHOLD_HIGH=85
export CPU_THRESHOLD_LOW=25
export MIN_NODES=2
export MAX_NODES=15
export RECONCILE_INTERVAL_SECONDS=20
export SKIP_TLS_VERIFY=true  # Only for development!

npm start
```

## Deployment
+
+### 1. Build and Push Image
+
+Use the helper script to build the multi-arch image and push it to GHCR:
+
+```bash
+./scripts/push-operator-image.sh [optional-tag]
+```
+
+### 2. Deploy to Cluster
+
+Apply the manifest to deploy the operator:
+
+```bash
+kubectl apply -f manifests/clever-autoscaler-operator.yaml
+```
+
+## How It Works

The operator uses two complementary reconciliation strategies:

### 1. Event-Driven Reconciliation (Watch)
- Watches all `NodeGroup` resources in the cluster for changes
- Immediately responds to ADDED, MODIFIED, and DELETED events
- Provides real-time reaction to NodeGroup changes

### 2. Periodic Reconciliation (Safety Net)
- Every `RECONCILE_INTERVAL_SECONDS`, checks all NodeGroups
- Fetches CPU and memory metrics for nodes in each NodeGroup
- Calculates average usage across all nodes in the group
- Compares against configured thresholds

### Scaling Decisions:
- **Scale UP**: If CPU OR memory exceeds high threshold (and below max nodes)
- **Scale DOWN**: If CPU AND memory are below low thresholds (and above min nodes)
- After scaling, enters cooldown period to allow nodes to stabilize
- Only one node is added/removed at a time for safety

## Example NodeGroup

```yaml
apiVersion: api.clever-cloud.com/v1
kind: NodeGroup
metadata:
  name: my-nodegroup
spec:
  flavor: M
  nodeCount: 3
```

The operator will monitor this NodeGroup and adjust `spec.nodeCount` based on metrics.

## Architecture

- **[src/index.ts](src/index.ts)** - Main operator entry point, watches NodeGroups
- **[src/autoscaler.ts](src/autoscaler.ts)** - Reconciliation logic and scaling decisions
- **[src/metrics.ts](src/metrics.ts)** - Metrics collection from Kubernetes metrics-server
- **[src/types.ts](src/types.ts)** - TypeScript type definitions

## Important Notes

- The operator assumes nodes are labeled with `nodegroup.api.clever-cloud.com/name=<nodegroup-name>` to match them to NodeGroups
- Requires proper RBAC permissions to:
  - Read/write NodeGroup resources
  - Read node metrics
  - Read node information
- Only one node is added/removed at a time for safety
- The cooldown period prevents rapid scaling oscillations
- Uses Node.js runtime (via tsx) for proper TLS client certificate support


### TLS Certificate Verification

For development clusters with self-signed certificates, use `SKIP_TLS_VERIFY=true`:

```bash
export SKIP_TLS_VERIFY=true
npm start
```

**⚠️ WARNING**: Never use `SKIP_TLS_VERIFY=true` in production! This disables TLS certificate verification and makes connections insecure.

## Example RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: clever-autoscaler-operator
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: clever-autoscaler-operator
rules:
- apiGroups: ["api.clever-cloud.com"]
  resources: ["nodegroups"]
  verbs: ["get", "list", "watch", "patch"]
- apiGroups: [""]
  resources: ["nodes"]
  verbs: ["get", "list"]
- apiGroups: ["metrics.k8s.io"]
  resources: ["nodes"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: clever-autoscaler-operator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: clever-autoscaler-operator
subjects:
- kind: ServiceAccount
  name: clever-autoscaler-operator
  namespace: default
```


## Test Procedure

This section describes how to verify the operator functionality step-by-step.

### Prerequisites

- **kubectl**: Installed and configured to access your cluster.
- **kubeconfig.yml**: A valid kubeconfig file for your Clever Cloud cluster (downloaded from the Console).
- **Node.js**: Installed (v18+) to run the operator locally if needed.
- **Docker**: Installed to build and push test images.
- **gh CLI**: Installed and authenticated (`gh auth login`) to push images to GitHub Container Registry.

### 1. Create Initial NodeGroup

Create a NodeGroup with 2 nodes of size S. This will be the target for our autoscaling tests.

```bash
kubectl apply -f test/manifests/initial-nodegroup.yaml
```

Verify the NodeGroup is created:
```bash
kubectl get nodegroup initial-nodegroup
```

Wait for the nodes to be ready (this may take a few minutes):
```bash
kubectl get nodes -w
```

### 2. Deploy Load Generator

Deploy the prime number generator with 1 replica. This pod generates CPU load, with a limit of 800m CPU.

```bash
kubectl apply -f test/manifests/prime-numbers.yaml
```

Verify the pod is running:
```bash
kubectl get pods
```

Check the node CPU usage (one node should show ~80% usage):
```bash
kubectl top nodes
```

### 3. Deploy Operator

Deploy the operator configured to watch `initial-nodegroup`.

```bash
kubectl apply -f test/manifests/operator-on-initial-nodegroup.yaml
```

Wait for the operator to be running:
```bash
kubectl get pods -l app=clever-autoscaler-operator -w
```

Check the logs. You should see it watching `initial-nodegroup` and reporting normal load (no scaling needed):
```bash
kubectl logs -l app=clever-autoscaler-operator -f
```

### 4. Trigger Autoscaling

Scale the load generator to 2 replicas to increase CPU usage.

```bash
kubectl scale deployment cpu-stress-test --replicas=2
```

Watch the operator logs. Within a few seconds (up to 30s), you should see it detect high CPU usage and trigger a scale-up:
```bash
kubectl logs -l app=clever-autoscaler-operator -f
```
*Look for: `📈 Scaling UP: 2 -> 3`*

Verify the NodeGroup size has increased:
```bash
kubectl get nodegroup initial-nodegroup
```

Watch the new node being created:
```bash
kubectl get nodes -w
```

## License

MIT
