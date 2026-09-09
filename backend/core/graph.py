"""OSM road network loader and manager using osmnx + NetworkX."""
from __future__ import annotations
import os
import pickle
import logging
from pathlib import Path
from typing import Optional, Tuple

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Default city for the MVP
DEFAULT_CITY = "Oxford, England"


class RoadGraph:
    """
    Wraps a NetworkX MultiDiGraph downloaded from OSM.

    Each edge has attributes:
        length      – metres
        travel_time – seconds (computed from maxspeed)
        congestion  – 0–100 score (initially 0, updated by traffic events)
        speed_kph   – km/h

    Node attributes:
        x – longitude
        y – latitude
    """

    def __init__(self, G: nx.MultiDiGraph):
        self.G = G
        self._ensure_congestion()

    # ── construction ─────────────────────────────────────────────────────────

    @classmethod
    def load(cls, city: str = DEFAULT_CITY, cache: bool = True) -> "RoadGraph":
        """Download (or load from cache) the drivable graph for *city*."""
        cache_path = DATA_DIR / f"{_safe_filename(city)}.pkl"

        if cache and cache_path.exists():
            logger.info("Loading cached graph for '%s'", city)
            with open(cache_path, "rb") as f:
                G = pickle.load(f)
            return cls(G)

        logger.info("Downloading OSM graph for '%s'", city)
        try:
            import osmnx as ox
            ox.settings.log_console = False
            G = ox.graph_from_place(city, network_type="drive", simplify=True)
            G = ox.add_edge_speeds(G)
            G = ox.add_edge_travel_times(G)
            G = nx.convert_node_labels_to_integers(G)
            if cache:
                with open(cache_path, "wb") as f:
                    pickle.dump(G, f)
            logger.info("Downloaded %d nodes, %d edges", G.number_of_nodes(), G.number_of_edges())
        except Exception as exc:
            logger.warning("OSM download failed (%s). Falling back to synthetic graph.", exc)
            G = _synthetic_graph(n_nodes=60, seed=42)

        return cls(G)

    @classmethod
    def synthetic(cls, n_nodes: int = 50, seed: int = 42) -> "RoadGraph":
        """Generate a random planar synthetic graph (no internet required)."""
        return cls(_synthetic_graph(n_nodes=n_nodes, seed=seed))

    # ── public interface ──────────────────────────────────────────────────────

    @property
    def nodes(self):
        return list(self.G.nodes(data=True))

    @property
    def edges(self):
        return list(self.G.edges(data=True, keys=True))

    def node_coords(self, node_id: int) -> Tuple[float, float]:
        """Return (lat, lon) for a node."""
        data = self.G.nodes[node_id]
        return float(data.get("y", 0.0)), float(data.get("x", 0.0))

    def nearest_node(self, lat: float, lon: float) -> Tuple[int, float, float, float]:
        """Find the node closest to (lat, lon). Returns (node_id, node_lat, node_lon, distance_meters)."""
        import math
        best_node = None
        best_dist = float("inf")
        best_lat, best_lon = lat, lon
        lat_rad = math.radians(lat)
        m_per_deg_lat = 111139.0
        m_per_deg_lon = 111139.0 * max(0.01, math.cos(lat_rad))

        for nid, d in self.G.nodes(data=True):
            ny = float(d.get("y", 0.0))
            nx = float(d.get("x", 0.0))
            dy = (ny - lat) * m_per_deg_lat
            dx = (nx - lon) * m_per_deg_lon
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < best_dist:
                best_dist = dist
                best_node = nid
                best_lat = ny
                best_lon = nx

        if best_node is None:
            first_node = list(self.G.nodes())[0]
            c = self.node_coords(first_node)
            return int(first_node), c[0], c[1], 0.0

        return int(best_node), best_lat, best_lon, round(best_dist, 1)

    def random_nodes(self, k: int, seed: Optional[int] = None) -> list:
        """Return k random node IDs."""
        rng = np.random.default_rng(seed)
        all_nodes = list(self.G.nodes())
        idx = rng.choice(len(all_nodes), size=min(k, len(all_nodes)), replace=False)
        return [all_nodes[i] for i in idx]

    def edge_data(self, u: int, v: int) -> dict:
        """Return attributes of the first edge between u and v."""
        if not self.G.has_edge(u, v):
            return {}
        edge_keys = list(self.G[u][v].keys())
        return dict(self.G[u][v][edge_keys[0]])

    def set_edge_attr(self, u: int, v: int, attr: str, value: float):
        """Update an attribute on all parallel edges between u and v."""
        if self.G.has_edge(u, v):
            for key in self.G[u][v]:
                self.G[u][v][key][attr] = value

    def get_edge_attr(self, u: int, v: int, attr: str, default: float = 0.0) -> float:
        if not self.G.has_edge(u, v):
            return default
        keys = list(self.G[u][v].keys())
        return float(self.G[u][v][keys[0]].get(attr, default))

    def remove_edge(self, u: int, v: int):
        """Close a road (remove all parallel edges between u and v)."""
        if self.G.has_edge(u, v):
            keys = list(self.G[u][v].keys())
            for key in keys:
                self.G.remove_edge(u, v, key)

    def restore_edge(self, u: int, v: int, attrs: dict):
        """Re-open a previously closed road."""
        if not self.G.has_edge(u, v):
            self.G.add_edge(u, v, **attrs)

    def to_geojson(self) -> dict:
        """Export the graph as a GeoJSON FeatureCollection for Leaflet."""
        features = []

        # Nodes
        for node_id, data in self.G.nodes(data=True):
            lat = data.get("y", 0)
            lon = data.get("x", 0)
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "id": node_id,
                    "type": "node",
                },
            })

        # Edges
        for u, v, key, data in self.G.edges(data=True, keys=True):
            u_data = self.G.nodes[u]
            v_data = self.G.nodes[v]
            coords = [[u_data.get("x", 0), u_data.get("y", 0)],
                      [v_data.get("x", 0), v_data.get("y", 0)]]
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {
                    "u": u, "v": v, "key": key,
                    "length": data.get("length", 0),
                    "travel_time": data.get("travel_time", 0),
                    "congestion": data.get("congestion", 0),
                    "speed_kph": data.get("speed_kph", 30),
                },
            })

        return {"type": "FeatureCollection", "features": features}

    def stats(self) -> dict:
        return {
            "node_count": self.G.number_of_nodes(),
            "edge_count": self.G.number_of_edges(),
            "is_connected": nx.is_weakly_connected(self.G),
        }

    # ── private ───────────────────────────────────────────────────────────────

    def _ensure_congestion(self):
        """Add a 'congestion' attribute (default 0) to all edges."""
        for u, v, key, data in self.G.edges(data=True, keys=True):
            if "congestion" not in data:
                self.G[u][v][key]["congestion"] = 0.0
            # Ensure travel_time exists
            if "travel_time" not in data:
                length = data.get("length", 100.0)
                speed_ms = data.get("speed_kph", 30.0) / 3.6
                self.G[u][v][key]["travel_time"] = length / max(speed_ms, 0.1)
            if "length" not in data:
                self.G[u][v][key]["length"] = 100.0


# ── helpers ───────────────────────────────────────────────────────────────────

def _safe_filename(city: str) -> str:
    return city.lower().replace(" ", "_").replace(",", "").replace("/", "_")[:60]


def _synthetic_graph(n_nodes: int = 50, seed: int = 42) -> nx.MultiDiGraph:
    """Build a random planar-ish road network with realistic attributes."""
    rng = np.random.default_rng(seed)
    G = nx.MultiDiGraph()

    # Place nodes on a ~5km × 5km grid (lat/lon near Oxford)
    base_lat, base_lon = 51.75, -1.25
    lat_range, lon_range = 0.045, 0.07  # ~5km each

    for i in range(n_nodes):
        lat = base_lat + rng.uniform(0, lat_range)
        lon = base_lon + rng.uniform(0, lon_range)
        G.add_node(i, y=lat, x=lon)

    nodes_arr = np.array([[G.nodes[i]["y"], G.nodes[i]["x"]] for i in range(n_nodes)])

    # Connect each node to its ~4 nearest neighbours
    from scipy.spatial import cKDTree
    tree = cKDTree(nodes_arr)
    k = min(5, n_nodes - 1)
    _, neighbours = tree.query(nodes_arr, k=k + 1)

    for i in range(n_nodes):
        for j in neighbours[i][1:]:
            j = int(j)
            lat1, lon1 = nodes_arr[i]
            lat2, lon2 = nodes_arr[j]
            # Haversine distance in metres (simplified)
            dlat = abs(lat2 - lat1) * 111_000
            dlon = abs(lon2 - lon1) * 111_000 * np.cos(np.radians((lat1 + lat2) / 2))
            length = float(np.hypot(dlat, dlon))
            speed_kph = float(rng.choice([30, 50, 60, 80]))
            travel_time = length / (speed_kph / 3.6)
            attrs = dict(
                length=round(length, 2),
                speed_kph=speed_kph,
                travel_time=round(travel_time, 2),
                congestion=0.0,
            )
            G.add_edge(i, j, **attrs)
            G.add_edge(j, i, **attrs)  # bidirectional

    # Ensure connectivity
    if not nx.is_weakly_connected(G):
        components = list(nx.weakly_connected_components(G))
        for comp in components[1:]:
            src = list(components[0])[0]
            dst = list(comp)[0]
            G.add_edge(src, dst, length=1000, speed_kph=30, travel_time=120, congestion=0.0)
            G.add_edge(dst, src, length=1000, speed_kph=30, travel_time=120, congestion=0.0)

    return G
