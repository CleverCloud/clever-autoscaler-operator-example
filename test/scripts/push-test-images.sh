#!/bin/bash
set -e

# Configuration
USERNAME="lostinbrittany"
ACCOUNT="clevercloud"
REGISTRY="ghcr.io"
EXTRA_TAG=$1

# Colors
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Logging in to GHCR...${NC}"
if command -v gh &> /dev/null; then
    gh auth token | docker login $REGISTRY -u $USERNAME --password-stdin
else
    echo "gh cli not found, assuming you are already logged in or please login manually with: docker login $REGISTRY"
fi

echo -e "${GREEN}Building and Pushing Prime Numbers Pod...${NC}"
docker build --platform linux/amd64 -t $REGISTRY/$ACCOUNT/test-pod-prime-numbers:latest ../pods/prime_numbers
docker push $REGISTRY/$ACCOUNT/test-pod-prime-numbers:latest

if [ ! -z "$EXTRA_TAG" ]; then
    echo "Also pushing prime-numbers:$EXTRA_TAG..."
    docker tag $REGISTRY/$ACCOUNT/test-pod-prime-numbers:latest $REGISTRY/$ACCOUNT/test-pod-prime-numbers:$EXTRA_TAG
    docker push $REGISTRY/$ACCOUNT/test-pod-prime-numbers:$EXTRA_TAG
fi

echo -e "${GREEN}Building and Pushing Memory Grabber Pod...${NC}"
docker build --platform linux/amd64 -t $REGISTRY/$ACCOUNT/test-pod-memory-grabber:latest ../pods/memory_grabber
docker push $REGISTRY/$ACCOUNT/test-pod-memory-grabber:latest

if [ ! -z "$EXTRA_TAG" ]; then
    echo "Also pushing memory-grabber:$EXTRA_TAG..."
    docker tag $REGISTRY/$ACCOUNT/test-pod-memory-grabber:latest $REGISTRY/$ACCOUNT/test-pod-memory-grabber:$EXTRA_TAG
    docker push $REGISTRY/$ACCOUNT/test-pod-memory-grabber:$EXTRA_TAG
fi

echo -e "${GREEN}Done!${NC}"
echo "Images pushed to:"
echo "- $REGISTRY/$ACCOUNT/test-pod-prime-numbers:latest"
echo "- $REGISTRY/$ACCOUNT/test-pod-memory-grabber:latest"
if [ ! -z "$EXTRA_TAG" ]; then
    echo "- $REGISTRY/$ACCOUNT/test-pod-prime-numbers:$EXTRA_TAG"
    echo "- $REGISTRY/$ACCOUNT/test-pod-memory-grabber:$EXTRA_TAG"
fi
echo ""
echo "NOTE: Make sure to set these packages to 'Public' in your GitHub Package settings if you want them to be pullable without authentication."
