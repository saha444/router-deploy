"""ROUTER — FastAPI application entry point."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.database import init_db
from backend.api.network import router as network_router
from backend.api.optimize import router as optimize_router
from backend.api.traffic import router as traffic_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

app = FastAPI(
    title="ROUTER",
    description=(
        "Event-Triggered Many-Objective Quantum Particle Swarm Optimization "
        "for Dynamic Vehicle Routing — REST API"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow the React dev server (localhost:5173) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(network_router)
app.include_router(optimize_router)
app.include_router(traffic_router)


@app.on_event("startup")
def startup():
    init_db()
    logging.getLogger(__name__).info("ROUTER backend started — database initialised.")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ROUTER"}
