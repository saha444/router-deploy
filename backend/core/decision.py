"""
Decision module — selects the operational route from the Pareto archive
based on the current traffic context.

Selection strategies:
    balanced      — lowest sum of normalised objective values (default)
    min_time      — lowest travel time
    min_congestion — lowest congestion exposure
    min_disruption — lowest disruption (preferred after minor events)
    lexicographic  — prioritise objectives in order: T, D, C, R
"""
from __future__ import annotations
from typing import List, Optional

import numpy as np

from backend.core.algorithms.pareto import ParetoArchive, Solution


STRATEGIES = {
    "balanced": 0,
    "min_time": 1,
    "min_congestion": 2,
    "min_disruption": 3,
    "lexicographic": 4,
}


class DecisionModule:
    """Selects a single route from the Pareto-optimal set for deployment."""

    def select(
        self,
        archive: ParetoArchive,
        strategy: str = "balanced",
        weights: Optional[np.ndarray] = None,
    ) -> Optional[Solution]:
        """
        Choose the best solution from the Pareto archive.

        Args:
            archive:  The Pareto archive from the optimizer.
            strategy: Selection strategy name.
            weights:  Optional weight vector for the 'balanced' strategy
                      (length 4: [w_time, w_dist, w_cong, w_disrupt]).
                      Defaults to equal weights [0.25, 0.25, 0.25, 0.25].

        Returns:
            The selected Solution, or None if archive is empty.
        """
        solutions = archive.get_all()
        if not solutions:
            return None

        if strategy == "min_time":
            return min(solutions, key=lambda s: s.objectives[0])

        if strategy == "min_congestion":
            return min(solutions, key=lambda s: s.objectives[2])

        if strategy == "min_disruption":
            return min(solutions, key=lambda s: s.objectives[3])

        if strategy == "lexicographic":
            return min(solutions, key=lambda s: tuple(s.objectives))

        # Default: balanced (normalised weighted sum)
        w = weights if weights is not None else np.array([0.25, 0.25, 0.25, 0.25])
        objs = np.array([s.objectives for s in solutions])
        ranges = objs.max(axis=0) - objs.min(axis=0)
        ranges[ranges == 0] = 1.0   # avoid division by zero
        normalised = (objs - objs.min(axis=0)) / ranges
        scores = normalised @ w
        best_idx = int(np.argmin(scores))
        return solutions[best_idx]

    def context_strategy(
        self,
        congestion_level: float,
        impact_score: float,
        impact_threshold: float,
    ) -> str:
        """
        Automatically choose a strategy based on the current traffic context.

        Rules (from PRD §18):
            - Severe congestion → min_congestion
            - Minor event (impact just above threshold) → min_disruption
            - Normal → balanced
        """
        if congestion_level > 70:
            return "min_congestion"
        ratio = impact_score / max(impact_threshold, 1.0)
        if ratio < 1.5:
            return "min_disruption"
        return "balanced"
