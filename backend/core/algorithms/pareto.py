"""Pareto dominance utilities and archive management for ET-MaO-QPSO."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
import numpy as np


OBJECTIVES = ["time", "distance", "congestion", "disruption"]
N_OBJ = len(OBJECTIVES)


@dataclass
class Solution:
    """A routing solution with four objectives and associated route data."""
    objectives: np.ndarray          # shape (4,): [T, D, C, R]
    route_data: dict                 # {vehicle_id: [customer_ids]}
    road_paths: dict = field(default_factory=dict)  # {vehicle_id: [[node_ids]]}
    particle_id: Optional[int] = None

    def dominates(self, other: "Solution") -> bool:
        """True if self weakly dominates other in all objectives AND strictly in ≥1."""
        return (
            np.all(self.objectives <= other.objectives) and
            np.any(self.objectives < other.objectives)
        )

    def as_dict(self) -> dict:
        return {
            "objectives": {
                "time": float(self.objectives[0]),
                "distance": float(self.objectives[1]),
                "congestion": float(self.objectives[2]),
                "disruption": float(self.objectives[3]),
            },
            "route_data": self.route_data,
            "road_paths": self.road_paths,
        }


class ParetoArchive:
    """
    Maintains the set of non-dominated solutions found so far.

    Thread-safety: single-threaded use assumed inside the optimizer loop.
    """

    def __init__(self, max_size: int = 200):
        self.max_size = max_size
        self._solutions: List[Solution] = []

    # ── public interface ─────────────────────────────────────────────────────

    def add(self, candidate: Solution) -> bool:
        """
        Attempt to add a candidate solution.
        Returns True if the candidate was accepted into the archive.
        """
        # Reject if dominated by any existing archive member
        for existing in self._solutions:
            if existing.dominates(candidate):
                return False

        # Remove solutions that the candidate dominates
        self._solutions = [s for s in self._solutions if not candidate.dominates(s)]

        # Capacity trimming via crowding distance
        if len(self._solutions) >= self.max_size:
            self._trim()

        self._solutions.append(candidate)
        return True

    def get_all(self) -> List[Solution]:
        return list(self._solutions)

    def __len__(self) -> int:
        return len(self._solutions)

    def is_empty(self) -> bool:
        return len(self._solutions) == 0

    def random_leader(self) -> Optional[Solution]:
        """Return a random archive member (used as gbest in QPSO)."""
        if not self._solutions:
            return None
        return self._solutions[np.random.randint(len(self._solutions))]

    def best_by(self, objective: str) -> Optional[Solution]:
        """Return the archive solution with the lowest value for a given objective."""
        idx = OBJECTIVES.index(objective)
        if not self._solutions:
            return None
        return min(self._solutions, key=lambda s: s.objectives[idx])

    def hypervolume(self, ref_point: Optional[np.ndarray] = None) -> float:
        """
        Approximate hypervolume indicator using the WFG algorithm for 4 objectives.
        Falls back to a simple dominated-hyperbox estimate for speed.
        """
        if not self._solutions:
            return 0.0

        objs = np.array([s.objectives for s in self._solutions])

        if ref_point is None:
            ref_point = objs.max(axis=0) * 1.1 + 1e-6

        # Monte-Carlo approximation (fast enough for ≤200 solutions in 4D)
        n_samples = 10_000
        samples = np.random.uniform(
            low=objs.min(axis=0),
            high=ref_point,
            size=(n_samples, N_OBJ),
        )
        dominated = np.any(
            np.all(objs[:, np.newaxis, :] <= samples[np.newaxis, :, :], axis=2),
            axis=0,
        )
        volume = np.prod(ref_point - objs.min(axis=0))
        return float(volume * dominated.mean())

    def summary(self) -> dict:
        if not self._solutions:
            return {"size": 0}
        objs = np.array([s.objectives for s in self._solutions])
        return {
            "size": len(self._solutions),
            "min": {k: float(objs[:, i].min()) for i, k in enumerate(OBJECTIVES)},
            "max": {k: float(objs[:, i].max()) for i, k in enumerate(OBJECTIVES)},
            "hypervolume": self.hypervolume(),
        }

    # ── private helpers ──────────────────────────────────────────────────────

    def _crowding_distances(self) -> np.ndarray:
        """Compute crowding distance for all archive members."""
        n = len(self._solutions)
        if n == 0:
            return np.array([])
        objs = np.array([s.objectives for s in self._solutions])
        distances = np.zeros(n)
        for m in range(N_OBJ):
            sorted_idx = np.argsort(objs[:, m])
            distances[sorted_idx[0]] = distances[sorted_idx[-1]] = np.inf
            obj_range = objs[sorted_idx[-1], m] - objs[sorted_idx[0], m]
            if obj_range == 0:
                continue
            for k in range(1, n - 1):
                distances[sorted_idx[k]] += (
                    objs[sorted_idx[k + 1], m] - objs[sorted_idx[k - 1], m]
                ) / obj_range
        return distances

    def _trim(self):
        """Remove the solution with the smallest crowding distance."""
        distances = self._crowding_distances()
        worst = int(np.argmin(distances))
        self._solutions.pop(worst)


def fast_non_dominated_sort(solutions: List[Solution]) -> List[List[int]]:
    """
    Fast non-dominated sorting (NSGA-II style).
    Returns a list of fronts, each front is a list of solution indices.
    """
    n = len(solutions)
    domination_count = [0] * n
    dominated_set: List[List[int]] = [[] for _ in range(n)]
    fronts: List[List[int]] = [[]]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if solutions[i].dominates(solutions[j]):
                dominated_set[i].append(j)
            elif solutions[j].dominates(solutions[i]):
                domination_count[i] += 1
        if domination_count[i] == 0:
            fronts[0].append(i)

    current = 0
    while fronts[current]:
        next_front: List[int] = []
        for i in fronts[current]:
            for j in dominated_set[i]:
                domination_count[j] -= 1
                if domination_count[j] == 0:
                    next_front.append(j)
        current += 1
        fronts.append(next_front)

    return [f for f in fronts if f]
