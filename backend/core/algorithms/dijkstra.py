"""Dijkstra road-level cost evaluator for VRP candidate solution assessment."""
from __future__ import annotations
from typing import Dict, List, Optional, Tuple

import networkx as nx
import numpy as np

from backend.core.algorithms.pareto import N_OBJ


def segment_cost(
    G: nx.MultiDiGraph,
    u: int,
    v: int,
    weight: str = "length",
) -> Tuple[float, float, float]:
    """
    Compute (travel_time, distance, congestion) for the shortest path from u to v.

    Uses NetworkX's Dijkstra with 'length' as the primary weight so that we always
    find the physically shortest path.  The other costs are accumulated along
    that same path.

    Returns (time_cost, distance_cost, congestion_cost) or (inf, inf, inf) if
    no path exists.
    """
    try:
        path = nx.dijkstra_path(G, u, v, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return (np.inf, np.inf, np.inf)

    time_cost = 0.0
    dist_cost = 0.0
    cong_cost = 0.0

    for a, b in zip(path[:-1], path[1:]):
        edge_data = _best_edge(G, a, b)
        time_cost += edge_data.get("travel_time", 0.0)
        dist_cost += edge_data.get("length", 0.0)
        cong_cost += edge_data.get("congestion", 0.0)

    return time_cost, dist_cost, cong_cost


def route_cost(
    G: nx.MultiDiGraph,
    node_sequence: List[int],
    prev_node_sequence: Optional[List[int]] = None,
) -> np.ndarray:
    """
    Evaluate the four objectives for a full route (a node sequence including depot).

    Args:
        G: The road graph.
        node_sequence: Ordered list of nodes [depot, c1, c2, ..., depot].
        prev_node_sequence: Previous route for disruption calculation.

    Returns:
        np.ndarray of shape (4,): [total_time, total_dist, total_cong, disruption].
    """
    total_time = 0.0
    total_dist = 0.0
    total_cong = 0.0

    for a, b in zip(node_sequence[:-1], node_sequence[1:]):
        t, d, c = segment_cost(G, a, b)
        if np.isinf(t):
            # Infeasible segment — penalise heavily
            return np.array([1e9, 1e9, 1e9, 1e9])
        total_time += t
        total_dist += d
        total_cong += c

    disruption = _disruption(node_sequence, prev_node_sequence)

    return np.array([total_time, total_dist, total_cong, disruption])


def multi_vehicle_cost(
    G: nx.MultiDiGraph,
    vehicle_routes: Dict[int, List[int]],   # vehicle_id → [depot, c1, c2, ..., depot]
    prev_routes: Optional[Dict[int, List[int]]] = None,
) -> np.ndarray:
    """
    Aggregate four-objective cost across all vehicles.

    Returns a (4,) objective vector [T, D, C, R].
    """
    totals = np.zeros(N_OBJ)
    for vid, seq in vehicle_routes.items():
        if len(seq) < 2:
            continue
        prev_seq = (prev_routes or {}).get(vid)
        totals += route_cost(G, seq, prev_seq)
    return totals


def road_path(G: nx.MultiDiGraph, u: int, v: int) -> List[int]:
    """Return the node-level Dijkstra path from u to v."""
    try:
        return nx.dijkstra_path(G, u, v, weight="length")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []


# ── private ───────────────────────────────────────────────────────────────────

def _best_edge(G: nx.MultiDiGraph, u: int, v: int) -> dict:
    """Return attributes of the shortest parallel edge between u and v."""
    if not G.has_edge(u, v):
        return {}
    edges = G[u][v]
    best_key = min(edges, key=lambda k: edges[k].get("length", float("inf")))
    return dict(edges[best_key])


def _disruption(
    new_seq: List[int],
    old_seq: Optional[List[int]],
) -> float:
    """
    Route disruption metric R: normalised edit distance between old and new
    customer visit sequences (ignoring depot endpoints).
    """
    if old_seq is None:
        return 0.0

    # Strip depot from both ends
    new_inner = new_seq[1:-1] if len(new_seq) > 2 else []
    old_inner = old_seq[1:-1] if len(old_seq) > 2 else []

    if not old_inner:
        return 0.0

    # Levenshtein distance on the customer sequences
    n, m = len(new_inner), len(old_inner)
    dp = list(range(m + 1))
    for i in range(1, n + 1):
        ndp = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if new_inner[i - 1] == old_inner[j - 1] else 1
            ndp[j] = min(ndp[j - 1] + 1, dp[j] + 1, dp[j - 1] + cost)
        dp = ndp

    return dp[m] / max(n, m, 1)
