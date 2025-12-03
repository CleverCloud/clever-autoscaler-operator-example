# Test Resources

This directory contains resources to test the Clever Autoscaler Operator. It includes sample applications (pods) that consume CPU and memory to trigger autoscaling events, along with scripts to build them and manifests to deploy them.

## Directory Structure

- **`pods/`**: Contains the source code for the test applications.
  - **`prime_numbers/`**: A Node.js application that calculates prime numbers to consume CPU.
  - **`memory_grabber/`**: A Node.js application that allocates a large array to consume memory.
- **`scripts/`**: Helper scripts for development and testing.
  - **`push-test-images.sh`**: A script to build the Docker images for the test pods and push them to the GitHub Container Registry (GHCR).
    - **Usage**: `./scripts/push-test-images.sh [tag]`
    - It always pushes the `latest` tag.
    - Optionally, you can provide a specific tag (e.g., `v1.0`) as an argument.
    - It builds multi-arch images (targeting `linux/amd64`) to ensure compatibility.
- **`manifests/`**: Kubernetes manifests to deploy the test applications.
  - **`prime-numbers.yaml`**: Deployment for the CPU-intensive pod.


## How to Run Tests

1.  **Build and Push Images**:
    Ensure you are logged into GHCR (`gh auth login`).
    ```bash
    ./scripts/push-test-images.sh
    ```

2.  **Deploy Pods**:
    Apply the manifests to your cluster.
    ```bash
    kubectl apply -f manifests/prime-numbers.yaml
    kubectl apply -f manifests/memory-grabber.yaml
    ```

3.  **Observe Autoscaling**:
    Watch the operator logs and the node count in your cluster to see the autoscaler react to the increased resource usage.
