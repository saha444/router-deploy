"""
NSGA-II external benchmark for evaluating ET-MaO-QPSO.

Implements:
    - Binary tournament selection
    - Simulated binary crossover (SBX)
    - Polynomial mutation
    - Fast non-dominated sorting
    - Crowding distance assignment
    - Elitist replacement
"""
from __future__ import annotations
import time
import logging
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

from backend.core.algorithms.pareto import ParetoArchive, Solution, fast_non_dominated_sort
from backend.core.algorithms.dijkstra import multi_vehicle_cost
from backend.core.vrp import (
    VRPInstance, decode, routes_to_node_sequences, feasibility_penalty
)

logger = logging.getLogger(__name__)


class NSGAII:
    """
    NSGA-II many-objective optimizer (external benchmark only).

    Uses real-coded representation (random keys) consistent with QPSO and PSO.
    """

    def __init__(
        self,
        instance: VRPInstance,
        pop_size: int = 30,
        max_iterations: int = 100,
        crossover_prob: float = 0.9,
        mutation_prob: float = 0.1,
        eta_c: float = 20.0,
        eta_m: float = 20.0,
        prev_routes: Optional[Dict[int, List[int]]] = None,
        callback: Optional[Callable] = None,
    ):
        self.instance = instance
        self.pop_size = pop_size
        self.max_iterations = max_iterations
        self.pc = crossover_prob
        self.pm = mutation_prob
        self.eta_c = eta_c
        self.eta_m = eta_m
        self.prev_routes = prev_routes or {}
        self.callback = callback
        self.archive = ParetoArchive(max_size=200)
        self.convergence: List[dict] = []

        self.D = instance.n_customers
        self.G = instance.graph

    def run(self) -> Tuple[ParetoArchive, List[dict]]:
        start = time.perf_counter()

        # Initial population
        population = np.random.uniform(0, 1, (self.pop_size, self.D))
        objectives = np.array([self._eval_obj(population[i]) for i in range(self.pop_size)])

        for t in range(self.max_iterations):
            # Generate offspring via SBX + polynomial mutation
            offspring_pop = self._generate_offspring(population)
            offspring_obj = np.array([self._eval_obj(offspring_pop[i]) for i in range(self.pop_size)])

            # Combine parent + offspring
            combined_pop = np.vstack([population, offspring_pop])
            combined_obj = np.vstack([objectives, offspring_obj])

            # Non-dominated sort + crowding distance selection
            solutions = [Solution(objectives=combined_obj[i], route_data={}, particle_id=i)
                         for i in range(len(combined_pop))]
            fronts = fast_non_dominated_sort(solutions)
            selected_indices = []
            for front in fronts:
                if len(selected_indices) + len(front) <= self.pop_size:
                    selected_indices.extend(front)
                else:
                    remaining = self.pop_size - len(selected_indices)
                    front_objs = combined_obj[front]
                    cd = _crowding_distance(front_objs)
                    sorted_front = [front[j] for j in np.argsort(-cd)]
                    selected_indices.extend(sorted_front[:remaining])
                    break

            population = combined_pop[selected_indices]
            objectives = combined_obj[selected_indices]

            # Update archive with first-front solutions
            for sol in [solutions[i] for i in fronts[0]]:
                self.archive.add(sol)

            hv = self.archive.hypervolume()
            record = {"iteration": t + 1, "hypervolume": round(hv, 4), "archive_size": len(self.archive)}
            self.convergence.append(record)
            if self.callback:
                self.callback(t + 1, hv, len(self.archive))

        return self.archive, self.convergence

    def _eval_obj(self, keys: np.ndarray) -> np.ndarray:
        customer_routes = decode(self.instance, keys)
        node_routes = routes_to_node_sequences(self.instance, customer_routes)
        penalty = feasibility_penalty(self.instance, customer_routes)
        return multi_vehicle_cost(self.G, node_routes, self.prev_routes) + penalty

    def _generate_offspring(self, population: np.ndarray) -> np.ndarray:
        n = len(population)
        offspring = np.empty_like(population)
        indices = np.random.permutation(n)
        for k in range(0, n, 2):
            i1, i2 = indices[k % n], indices[(k + 1) % n]
            p1, p2 = population[i1].copy(), population[i2].copy()
            if np.random.rand() < self.pc:
                p1, p2 = _sbx_crossover(p1, p2, self.eta_c)
            p1 = _polynomial_mutation(p1, self.pm, self.eta_m)
            p2 = _polynomial_mutation(p2, self.pm, self.eta_m)
            offspring[k] = p1
            if k + 1 < n:
                offspring[k + 1] = p2
        return offspring


# ── helpers ───────────────────────────────────────────────────────────────────

def _sbx_crossover(p1: np.ndarray, p2: np.ndarray, eta: float):
    """Simulated Binary Crossover."""
    u = np.random.uniform(0, 1, len(p1))
    beta = np.where(u <= 0.5,
                    (2 * u) ** (1 / (eta + 1)),
                    (1 / (2 * (1 - u))) ** (1 / (eta + 1)))
    c1 = np.clip(0.5 * ((1 + beta) * p1 + (1 - beta) * p2), 0, 1)
    c2 = np.clip(0.5 * ((1 - beta) * p1 + (1 + beta) * p2), 0, 1)
    return c1, c2


def _polynomial_mutation(x: np.ndarray, pm: float, eta: float) -> np.ndarray:
    """Polynomial mutation."""
    result = x.copy()
    for j in range(len(result)):
        if np.random.rand() < pm:
            u = np.random.rand()
            if u < 0.5:
                delta = (2 * u) ** (1 / (eta + 1)) - 1
            else:
                delta = 1 - (2 * (1 - u)) ** (1 / (eta + 1))
            result[j] = np.clip(result[j] + delta, 0, 1)
    return result


def _crowding_distance(objs: np.ndarray) -> np.ndarray:
    n, m = objs.shape
    distances = np.zeros(n)
    for j in range(m):
        sorted_idx = np.argsort(objs[:, j])
        distances[sorted_idx[0]] = distances[sorted_idx[-1]] = np.inf
        obj_range = objs[sorted_idx[-1], j] - objs[sorted_idx[0], j]
        if obj_range == 0:
            continue
        for k in range(1, n - 1):
            distances[sorted_idx[k]] += (
                objs[sorted_idx[k + 1], j] - objs[sorted_idx[k - 1], j]
            ) / obj_range
    return distances
