#!/bin/bash

# Terminate background processes on exit
trap "kill 0" EXIT

echo "=========================================================="
echo "      💎  PAYFLOW CERTIFY - DEVELOPMENT RUNNER  💎"
echo "=========================================================="

# Start backend
echo "🚀 Starting FastAPI Backend (http://127.0.0.1:8000)..."
cd backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!
cd ..

# Start frontend
echo "🚀 Starting Angular Frontend (http://localhost:4200)..."
cd frontend
npx ng serve &
FRONTEND_PID=$!
cd ..

# Wait for both processes
wait
