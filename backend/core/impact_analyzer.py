"""
Impact Analyzer — determines whether a traffic event is significant enough to
trigger reoptimization of active vehicle routes.

Impact score:
    I = α·ΔT + β·ΔC + γ·E_r

where:
    ΔT   = increase in travel time (seconds)
    ΔC   = increase in congestion (0–100 scale)
    E_r  = number of active vehicle routes that traverse the affected edge
    α, β, γ = configurable weight coefficients

If I > θ (threshold), reoptimization is triggered.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List


@dataclass
class ImpactResult:
    event_id: int
    edge_u: int
    edge_v: int
    delta_time: float
    delta_congestion: float
    route_exposure: int              # number of active routes using the edge
    impact_score: float
    significant: bool
    affected_vehicle_ids: List[int]  # vehicle IDs whose routes are impacted
    threshold: float


class ImpactAnalyzer:
    """
    Evaluates the significance of a traffic event relative to active routes.

    Args:
        alpha:     Weight for travel-time change.
        beta:      Weight for congestion change.
        gamma:     Weight for route exposure.
        threshold: Impact score above which reoptimization is triggered (θ).
    """

    def __init__(
        self,
        alpha: float = 0.4,
        beta: float = 0.3,
        gamma: float = 30.0,   # each affected route contributes ~30 to score
        threshold: float = 50.0,
    ):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.threshold = threshold

    def analyze(
        self,
        event_id: int,
        edge_u: int,
        edge_v: int,
        delta_time: float,
        delta_congestion: float,
        active_routes: Dict[int, List[List[int]]],  # vehicle_id → list of road node sequences
    ) -> ImpactResult:
        """
        Compute the impact score for a traffic event.

        Args:
            event_id:         Identifier of the traffic event.
            edge_u, edge_v:   The affected road edge.
            delta_time:       Travel-time increase in seconds.
            delta_congestion: Congestion increase (0–100).
            active_routes:    Currently deployed vehicle routes (road-node sequences).

        Returns:
            ImpactResult with the score and significance decision.
        """
        # Count how many active vehicle routes traverse this edge
        affected_vehicle_ids = []
        for vid, node_sequences in active_routes.items():
            for node_seq in node_sequences:
                if _edge_in_path(edge_u, edge_v, node_seq):
                    affected_vehicle_ids.append(vid)
                    break   # count each vehicle at most once

        E_r = len(affected_vehicle_ids)

        impact = (
            self.alpha * delta_time
            + self.beta * delta_congestion
            + self.gamma * E_r
        )

        return ImpactResult(
            event_id=event_id,
            edge_u=edge_u,
            edge_v=edge_v,
            delta_time=delta_time,
            delta_congestion=delta_congestion,
            route_exposure=E_r,
            impact_score=round(impact, 4),
            significant=impact > self.threshold,
            affected_vehicle_ids=affected_vehicle_ids,
            threshold=self.threshold,
        )

    def configure(self, alpha: float = None, beta: float = None,
                  gamma: float = None, threshold: float = None):
        """Update analyzer parameters at runtime."""
        if alpha is not None:
            self.alpha = alpha
        if beta is not None:
            self.beta = beta
        if gamma is not None:
            self.gamma = gamma
        if threshold is not None:
            self.threshold = threshold


def _edge_in_path(u: int, v: int, node_sequence: List[int]) -> bool:
    """Return True if the directed edge (u→v) appears in the node sequence."""
    for a, b in zip(node_sequence[:-1], node_sequence[1:]):
        if a == u and b == v:
            return True
    return False
