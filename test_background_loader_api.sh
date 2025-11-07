#!/bin/bash

# Test script for Background Metrics Loader API
# Run this after starting the server to test the API endpoints

BASE_URL="http://localhost:8000"

echo "=== Background Metrics Loader API Tests ==="
echo

echo "1. Check Status:"
curl -s "${BASE_URL}/market/background-metrics-loader/status" | jq '.'
echo -e "\n"

echo "2. Trigger Manual Cycle:"
curl -s -X POST "${BASE_URL}/market/background-metrics-loader/trigger" | jq '.'
echo -e "\n"

echo "3. Check Status Again (should show last cycle stats):"
curl -s "${BASE_URL}/market/background-metrics-loader/status" | jq '.'
echo -e "\n"

echo "4. Stop the service:"
curl -s -X POST "${BASE_URL}/market/background-metrics-loader/stop" | jq '.'
echo -e "\n"

echo "5. Check Status (should show not running):"
curl -s "${BASE_URL}/market/background-metrics-loader/status" | jq '.'
echo -e "\n"

echo "6. Start the service again:"
curl -s -X POST "${BASE_URL}/market/background-metrics-loader/start" | jq '.'
echo -e "\n"

echo "7. Final Status Check:"
curl -s "${BASE_URL}/market/background-metrics-loader/status" | jq '.'
echo -e "\n"

echo "=== API Tests Complete ==="
