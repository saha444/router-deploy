"""
VRP problem definition and solution decoder.

A VRP instance contains:
    - A road graph G
    - A depot node
    - A list of customers (node_id, demand)
    - A list of vehicles (id, capacity)

Solutions are represented as *random-key encodings*: a vector of N floats in [0, 1]
where N is the number of customers.  The decoder maps this to a concrete assignment
of customers to vehicles in a visit order.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import networkx as nx


@dataclass
class CustomerDef:
    customer_id: int
    node_id: int
    pickup_weight: float = 0.0
    dropoff_weight: float = 0.0
    lat: float = 0.0
    lon: float = 0.0


@dataclass
class VehicleDef:
    vehicle_id: int
    capacity: float


@dataclass
class VRPInstance:
    """Complete VRP problem definition."""
    graph: nx.MultiDiGraph
    depot_node: int
    customers: List[CustomerDef]
    vehicles: List[VehicleDef]

    @property
    def n_customers(self) -> int:
        return len(self.customers)

    @property
    def n_vehicles(self) -> int:
        return len(self.vehicles)

    @property
    def total_demand(self) -> float:
        return sum(max(c.pickup_weight, c.dropoff_weight) for c in self.customers)

    @property
    def total_capacity(self) -> float:
        return sum(v.capacity for v in self.vehicles)

    def is_feasible(self) -> bool:
        return self.total_capacity >= self.total_demand


# ── Random-key decoder ────────────────────────────────────────────────────────

def decode(
    instance: VRPInstance,
    keys: np.ndarray,
) -> Dict[int, List[int]]:
    """
    Decode a random-key particle position to a concrete VRP solution.

    Args:
        instance: The VRP problem.
        keys: 1-D array of length N (one float per customer).

    Returns:
        Dict mapping vehicle_id → [customer_ids] in visit order.
        The depot is NOT included here; it is added when building node sequences.
    """
    n = instance.n_customers
    assert len(keys) == n, f"keys length {len(keys)} != {n} customers"

    # Sort customers by their key value (ascending → first served)
    order = np.argsort(keys)
    sorted_customers = [instance.customers[i] for i in order]

    routes: Dict[int, List[int]] = {v.vehicle_id: [] for v in instance.vehicles}
    loads: Dict[int, float] = {v.vehicle_id: 0.0 for v in instance.vehicles}
    capacities: Dict[int, float] = {v.vehicle_id: v.capacity for v in instance.vehicles}
    vehicle_ids = [v.vehicle_id for v in instance.vehicles]

    for cust in sorted_customers:
        assigned = False
        effective_demand = max(cust.pickup_weight, cust.dropoff_weight)
        # Try to assign to the vehicle with the most available space that can fit this customer
        candidates = [
            vid for vid in vehicle_ids
            if loads[vid] + effective_demand <= capacities[vid]
        ]
        if candidates:
            # Choose vehicle with highest remaining capacity (balanced loading)
            vid = max(candidates, key=lambda v: capacities[v] - loads[v])
            routes[vid].append(cust.customer_id)
            loads[vid] += effective_demand
            assigned = True

        if not assigned:
            # Repair: assign to the vehicle with the largest remaining capacity (constraint violation allowed during eval)
            vid = max(vehicle_ids, key=lambda v: capacities[v] - loads[v])
            routes[vid].append(cust.customer_id)
            loads[vid] += effective_demand

    return routes


def routes_to_node_sequences(
    instance: VRPInstance,
    customer_routes: Dict[int, List[int]],
) -> Dict[int, List[int]]:
    """
    Convert customer-ID routes to node-ID sequences including the depot.

    Returns Dict[vehicle_id] → [depot_node, node1, node2, ..., depot_node]
    """
    cust_map: Dict[int, int] = {c.customer_id: c.node_id for c in instance.customers}
    node_routes: Dict[int, List[int]] = {}
    for vid, cust_ids in customer_routes.items():
        if not cust_ids:
            node_routes[vid] = [instance.depot_node, instance.depot_node]
        else:
            nodes = [cust_map[cid] for cid in cust_ids]
            node_routes[vid] = [instance.depot_node] + nodes + [instance.depot_node]
    return node_routes


def is_feasible_solution(instance: VRPInstance, customer_routes: Dict[int, List[int]]) -> bool:
    """Check capacity and coverage constraints."""
    cust_map = {c.customer_id: c for c in instance.customers}
    cap_map = {v.vehicle_id: v.capacity for v in instance.vehicles}
    all_served = set()
    for vid, cust_ids in customer_routes.items():
        total_dropoff = sum(cust_map[cid].dropoff_weight for cid in cust_ids)
        current_load = total_dropoff
        max_load = current_load
        for cid in cust_ids:
            current_load = current_load - cust_map[cid].dropoff_weight + cust_map[cid].pickup_weight
            max_load = max(max_load, current_load)
        if max_load > cap_map.get(vid, 0) * 1.001:  # 0.1% tolerance
            return False
        all_served.update(cust_ids)
    all_customers = {c.customer_id for c in instance.customers}
    return all_served == all_customers


def feasibility_penalty(instance: VRPInstance, customer_routes: Dict[int, List[int]]) -> float:
    """Return a penalty score for constraint violations (0 = fully feasible)."""
    cust_map = {c.customer_id: c for c in instance.customers}
    cap_map = {v.vehicle_id: v.capacity for v in instance.vehicles}
    all_served: set = set()
    penalty = 0.0
    for vid, cust_ids in customer_routes.items():
        total_dropoff = sum(cust_map[cid].dropoff_weight for cid in cust_ids)
        current_load = total_dropoff
        max_load = current_load
        for cid in cust_ids:
            current_load = current_load - cust_map[cid].dropoff_weight + cust_map[cid].pickup_weight
            max_load = max(max_load, current_load)
        
        cap = cap_map.get(vid, 0)
        if max_load > cap:
            penalty += (max_load - cap) * 100.0
        all_served.update(cust_ids)
    all_customers = {c.customer_id for c in instance.customers}
    missing = all_customers - all_served
    duplicate = len(all_served) - len(all_customers - missing)
    penalty += len(missing) * 500.0
    penalty += max(0, duplicate) * 200.0
    return penalty
