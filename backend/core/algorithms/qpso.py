"""
ET-MaO-QPSO — Event-Triggered Many-Objective Quantum Particle Swarm Optimization.

Algorithm:
    1. Initialize N particles with random-key positions in [0, 1]^D (D = n_customers).
    2. Evaluate each particle by decoding it to a VRP solution and computing
       the 4-objective vector via Dijkstra road-level evaluation.
    3. Maintain a Pareto archive of non-dominated solutions.
    4. Update personal bests (pbest) using Pareto dominance.
    5. Select a global best (gbest) randomly from the Pareto archive.
    6. Compute mean best position (mbest) across all pbest positions.
    7. Update particle positions using the quantum delta potential well rule.
    8. Repeat until convergence or max_iterations.

QPSO Update Rule (per dimension j):
    attractor = phi * pbest[i][j] + (1 - phi) * gbest[j]      phi ~ U(0,1)
    beta = beta_max - (beta_max - beta_min) * (t / T_max)      (annealing)
    u   ~ U(0, 1)
    x[i][j] = attractor ± beta * |mbest[j] - x[i][j]| * ln(1/u)
    sign chosen uniformly at random.
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


class ETMaOQPSO:
    """
    Event-Triggered Many-Objective QPSO optimizer.

    Args:
        instance:        The VRP problem instance.
        n_particles:     Swarm population size.
        max_iterations:  Maximum number of iterations.
        beta_max:        Maximum contraction-expansion coefficient.
        beta_min:        Minimum contraction-expansion coefficient.
        archive_size:    Maximum Pareto archive size.
        prev_routes:     Previous vehicle routes (for disruption objective).
        callback:        Optional function called each iteration with
                         (iteration, hypervolume, archive_size).
    """

    def __init__(
        self,
        instance: VRPInstance,
        n_particles: int = 30,
        max_iterations: int = 100,
        beta_max: float = 1.0,
        beta_min: float = 0.5,
        archive_size: int = 200,
        prev_routes: Optional[Dict[int, List[int]]] = None,
        callback: Optional[Callable] = None,
    ):
        self.instance = instance
        self.n_particles = n_particles
        self.max_iterations = max_iterations
        self.beta_max = beta_max
        self.beta_min = beta_min
        self.archive = ParetoArchive(max_size=archive_size)
        self.prev_routes = prev_routes or {}
        self.callback = callback

        self.D = instance.n_customers   # particle dimension
        self.G = instance.graph
        self.convergence: List[dict] = []

        # Initialize particle positions in [0, 1]^D
        self.positions = np.random.uniform(0, 1, (n_particles, self.D))
        # Personal bests
        self.pbest_positions = self.positions.copy()
        self.pbest_objectives: List[Optional[np.ndarray]] = [None] * n_particles

    # ── public ───────────────────────────────────────────────────────────────

    def run(self) -> Tuple[ParetoArchive, List[dict]]:
        """
        Execute the optimization loop.

        Returns:
            (ParetoArchive, convergence_data)
        """
        start = time.perf_counter()

        # Evaluate initial population
        for i in range(self.n_particles):
            sol = self._evaluate(i)
            self.archive.add(sol)
            self.pbest_objectives[i] = sol.objectives.copy()

        for t in range(self.max_iterations):
            beta = self.beta_max - (self.beta_max - self.beta_min) * (t / max(self.max_iterations - 1, 1))
            mbest = self._compute_mbest()
            gbest_sol = self.archive.random_leader()

            if gbest_sol is None:
                continue

            gbest_pos = self._solution_to_position(gbest_sol)

            for i in range(self.n_particles):
                self._update_particle(i, mbest, gbest_pos, beta)
                sol = self._evaluate(i)

                # Update personal best (Pareto sense: accept if not dominated by old pbest)
                old_obj = self.pbest_objectives[i]
                if old_obj is None or not _dominates(old_obj, sol.objectives):
                    self.pbest_positions[i] = self.positions[i].copy()
                    self.pbest_objectives[i] = sol.objectives.copy()

                self.archive.add(sol)

            hv = self.archive.hypervolume()
            record = {"iteration": t + 1, "hypervolume": round(hv, 4), "archive_size": len(self.archive)}
            self.convergence.append(record)

            if self.callback:
                self.callback(t + 1, hv, len(self.archive))

            if (t + 1) % 10 == 0:
                elapsed = time.perf_counter() - start
                logger.info("Iter %d/%d | archive=%d | hv=%.4f | t=%.1fs",
                            t + 1, self.max_iterations, len(self.archive), hv, elapsed)

        return self.archive, self.convergence

    # ── private ───────────────────────────────────────────────────────────────

    def _evaluate(self, particle_idx: int) -> Solution:
        """Decode particle position → VRP routes → 4-objective vector."""
        keys = self.positions[particle_idx]
        customer_routes = decode(self.instance, keys)
        node_routes = routes_to_node_sequences(self.instance, customer_routes)

        # Penalty for constraint violations
        penalty = feasibility_penalty(self.instance, customer_routes)

        objectives = multi_vehicle_cost(self.G, node_routes, self.prev_routes)
        objectives += penalty  # add penalty to all objectives

        road_paths = {}  # road paths populated later if needed for display

        return Solution(
            objectives=objectives,
            route_data={vid: [int(c) for c in cids] for vid, cids in customer_routes.items()},
            road_paths=road_paths,
            particle_id=particle_idx,
        )

    def _compute_mbest(self) -> np.ndarray:
        """Mean best position across all personal bests."""
        return self.pbest_positions.mean(axis=0)

    def _update_particle(
        self,
        i: int,
        mbest: np.ndarray,
        gbest_pos: np.ndarray,
        beta: float,
    ):
        """QPSO position update using the quantum delta potential well rule."""
        phi = np.random.uniform(0, 1, self.D)
        attractor = phi * self.pbest_positions[i] + (1 - phi) * gbest_pos
        u = np.random.uniform(0, 1, self.D)
        sign = np.where(np.random.uniform(0, 1, self.D) < 0.5, 1.0, -1.0)
        delta = beta * np.abs(mbest - self.positions[i]) * np.log(1.0 / np.maximum(u, 1e-10))
        self.positions[i] = np.clip(attractor + sign * delta, 0.0, 1.0)

    def _solution_to_position(self, sol: Solution) -> np.ndarray:
        """
        Convert a Pareto archive solution back to an approximate random-key position.
        Needed to use archive solutions as gbest in the QPSO update.
        """
        n = self.instance.n_customers
        cust_order = []
        for vid in sorted(sol.route_data.keys()):
            cust_order.extend(sol.route_data[vid])

        # Build position: customer appearing earlier gets a smaller key
        pos = np.zeros(n)
        cust_ids = [c.customer_id for c in self.instance.customers]
        for rank, cid in enumerate(cust_order):
            if cid in cust_ids:
                idx = cust_ids.index(cid)
                pos[idx] = rank / max(n, 1)
        return np.clip(pos, 0.0, 1.0)


def _dominates(a: np.ndarray, b: np.ndarray) -> bool:
    """True if objective vector a dominates b."""
    return bool(np.all(a <= b) and np.any(a < b))
