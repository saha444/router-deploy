"""A* real-time pathfinder for vehicle rerouting after traffic events."""
from __future__ import annotations
import math
from typing import List, Optional

import networkx as nx


def _euclidean_heuristic(G: nx.MultiDiGraph):
    """
    Returns a heuristic function h(u, v) = Euclidean distance (in metres) from
    node u to node v, using lat/lon node attributes.
    """
    def h(u: int, v: int) -> float:
        if u not in G.nodes or v not in G.nodes:
            return 0.0
        u_lat = G.nodes[u].get("y", 0.0)
        u_lon = G.nodes[u].get("x", 0.0)
        v_lat = G.nodes[v].get("y", 0.0)
        v_lon = G.nodes[v].get("x", 0.0)
        dlat = (u_lat - v_lat) * 111_000
        dlon = (u_lon - v_lon) * 111_000 * math.cos(math.radians((u_lat + v_lat) / 2))
        return math.hypot(dlat, dlon)

    return h


def astar_path(
    G: nx.MultiDiGraph,
    source: int,
    target: int,
    weight: str = "travel_time",
) -> List[int]:
    """
    Find the lowest-cost path from *source* to *target* using A*.
    """
    try:
        return nx.astar_path(
            G,
            source,
            target,
            heuristic=_euclidean_heuristic(G),
            weight=weight,
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []


def astar_path_cost(
    G: nx.MultiDiGraph,
    source: int,
    target: int,
    weight: str = "travel_time",
) -> float:
    """
    Return the total cost of the A* path from source to target.
    Returns infinity if no path exists.
    """
    try:
        return nx.astar_path_length(
            G,
            source,
            target,
            heuristic=_euclidean_heuristic(G),
            weight=weight,
        )
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return float("inf")


def reroute_vehicle(
    G: nx.MultiDiGraph,
    current_node: int,
    remaining_customers: List[int],
    depot_node: int,
    weight: str = "travel_time",
) -> List[int]:
    """
    Compute an updated road-level path for a vehicle to serve its remaining customers
    and return to depot, using A* for each segment.

    Returns:
        A flat list of road nodes [current_node, ..., c1, ..., c2, ..., depot].
    """
    full_path: List[int] = [current_node]
    waypoints = remaining_customers + [depot_node]
    node = current_node

    for wp in waypoints:
        segment = astar_path(G, node, wp, weight=weight)
        if not segment:
            # No path found – return partial path
            break
        # Avoid duplicating the start node of each segment
        full_path.extend(segment[1:])
        node = wp

    return full_path
