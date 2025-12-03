#!/bin/bash
set -e

# Configuration
USERNAME="lostinbrittany"
# ACCOUNT="clevercloud"
ACCOUNT="lostinbrittany"
REGISTRY="ghcr.io"
IMAGE_NAME="clever-autoscaler-operator-example"
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

echo -e "${GREEN}Building and Pushing Operator Image...${NC}"
docker build --platform linux/amd64 -t $REGISTRY/$ACCOUNT/$IMAGE_NAME:latest ..
docker push $REGISTRY/$ACCOUNT/$IMAGE_NAME:latest

if [ ! -z "$EXTRA_TAG" ]; then
    echo "Also pushing $IMAGE_NAME:$EXTRA_TAG..."
    docker tag $REGISTRY/$ACCOUNT/$IMAGE_NAME:latest $REGISTRY/$ACCOUNT/$IMAGE_NAME:$EXTRA_TAG
    docker push $REGISTRY/$ACCOUNT/$IMAGE_NAME:$EXTRA_TAG
fi

echo -e "${GREEN}Done!${NC}"
echo "Image pushed to:"
echo "- $REGISTRY/$ACCOUNT/$IMAGE_NAME:latest"
if [ ! -z "$EXTRA_TAG" ]; then
    echo "- $REGISTRY/$ACCOUNT/$IMAGE_NAME:$EXTRA_TAG"
fi
echo ""
echo "NOTE: Make sure to set this package to 'Public' in your GitHub Package settings if you want it to be pullable without authentication."
