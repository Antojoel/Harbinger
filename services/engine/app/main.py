"""
FastAPI Engine Main Application Entrypoint
===========================================
Initializes the FastAPI application, CORS middleware, and API router.
"""

import logging

from api.routes import router as api_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from graph.neo4j_client import graph_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("harbinger.engine")

app = FastAPI(
    title="Harbinger Core Engine API",
    description="Customs Risk Simulation & Graph Memory Engine",
    version="0.1.0",
)

# Enable CORS for local web app development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    logger.info("Harbinger engine starting up")
    graph_client.connect()


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Harbinger engine shutting down")
    graph_client.close()


@app.get("/")
async def root_healthcheck():
    return {
        "service": "Harbinger Core Engine",
        "status": "healthy",
        "endpoints": [
            "/simulate", "/record-outcome", "/graph", "/patterns",
            "/voice-query", "/create-payment-order", "/verify-payment"
        ]
    }


# Include REST routes under /api
app.include_router(api_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
