"""
Classical PSO baseline for benchmarking against ET-MaO-QPSO.

Uses a weighted-sum aggregation of all four objectives (equal weights by default)
to collapse the many-objective problem to a single objective, enabling the
standard velocity-position PSO update.

This is intentionally kept simple so that the performance *gap* between
single-objective PSO and the proposed many-objective QPSO is measurable.
"""
from __future__ import annotations
import time
import logging
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

from backend.core.algorithms.pareto import ParetoArchive, Solution
from backend.core.algorithms.dijkstra import multi_vehicle_cost
from backend.core.vrp import (
    VRPInstance, decode, routes_to_node_sequences, feasibility_penalty
)

logger = logging.getLogger(__name__)


class ClassicalPSO:
    """
    Classical (single-objective) Particle Swarm Optimization.

    The four objectives are combined as a weighted sum:
        f = w_t*T + w_d*D + w_c*C + w_r*R

    Default weights are equal (0.25 each).  This means PSO sacrifices the
    trade-off structure that QPSO preserves via the Pareto archive.
    """

    def __init__(
        self,
        instance: VRPInstance,
        n_particles: int = 30,
        max_iterations: int = 100,
        weights: Optional[np.ndarray] = None,
        w_inertia: float = 0.7,
        c1: float = 1.5,
        c2: float = 1.5,
        prev_routes: Optional[Dict[int, List[int]]] = None,
        callback: Optional[Callable] = None,
    ):
        self.instance = instance
        self.n_particles = n_particles
        self.max_iterations = max_iterations
        self.weights = weights if weights is not None else np.array([0.25, 0.25, 0.25, 0.25])
        self.w = w_inertia
        self.c1 = c1
        self.c2 = c2
        self.prev_routes = prev_routes or {}
        self.callback = callback
        self.archive = ParetoArchive(max_size=200)   # still record non-dominated for fair comparison
        self.convergence: List[dict] = []

        self.D = instance.n_customers
        self.G = instance.graph

        self.positions = np.random.uniform(0, 1, (n_particles, self.D))
        self.velocities = np.random.uniform(-0.5, 0.5, (n_particles, self.D))
        self.pbest_positions = self.positions.copy()
        self.pbest_scores = np.full(n_particles, np.inf)
        self.gbest_position: Optional[np.ndarray] = None
        self.gbest_score: float = np.inf

    def run(self) -> Tuple[ParetoArchive, List[dict]]:
        start = time.perf_counter()

        # Evaluate initial population
        for i in range(self.n_particles):
            score, sol = self._evaluate(i)
            self.archive.add(sol)
            if score < self.pbest_scores[i]:
                self.pbest_scores[i] = score
                self.pbest_positions[i] = self.positions[i].copy()
            if score < self.gbest_score:
                self.gbest_score = score
                self.gbest_position = self.positions[i].copy()

        for t in range(self.max_iterations):
            for i in range(self.n_particles):
                r1 = np.random.uniform(0, 1, self.D)
                r2 = np.random.uniform(0, 1, self.D)
                self.velocities[i] = (
                    self.w * self.velocities[i]
                    + self.c1 * r1 * (self.pbest_positions[i] - self.positions[i])
                    + self.c2 * r2 * (self.gbest_position - self.positions[i])
                )
                self.positions[i] = np.clip(self.positions[i] + self.velocities[i], 0.0, 1.0)

                score, sol = self._evaluate(i)
                self.archive.add(sol)

                if score < self.pbest_scores[i]:
                    self.pbest_scores[i] = score
                    self.pbest_positions[i] = self.positions[i].copy()
                if score < self.gbest_score:
                    self.gbest_score = score
                    self.gbest_position = self.positions[i].copy()

            hv = self.archive.hypervolume()
            record = {"iteration": t + 1, "hypervolume": round(hv, 4), "archive_size": len(self.archive)}
            self.convergence.append(record)
            if self.callback:
                self.callback(t + 1, hv, len(self.archive))

        return self.archive, self.convergence

    def _evaluate(self, i: int):
        keys = self.positions[i]
        customer_routes = decode(self.instance, keys)
        node_routes = routes_to_node_sequences(self.instance, customer_routes)
        penalty = feasibility_penalty(self.instance, customer_routes)
        objectives = multi_vehicle_cost(self.G, node_routes, self.prev_routes) + penalty
        score = float(self.weights @ objectives)
        sol = Solution(
            objectives=objectives,
            route_data={vid: [int(c) for c in cids] for vid, cids in customer_routes.items()},
            particle_id=i,
        )
        return score, sol
