"""Traffic event simulation and road graph state management."""
from __future__ import annotations
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from backend.core.graph import RoadGraph

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    accident = "accident"
    road_closure = "road_closure"
    congestion_spike = "congestion_spike"
    recovery = "recovery"


@dataclass
class TrafficEvent:
    """A single traffic disturbance on a road edge."""
    event_id: int
    event_type: EventType
    edge_u: int
    edge_v: int
    delta_time: float           # additional seconds of travel time
    delta_congestion: float     # congestion increase (0–100)
    road_closed: bool = False
    active: bool = True

    # Snapshot of original edge state before the event (for recovery)
    _original_travel_time: float = field(default=0.0, repr=False)
    _original_congestion: float = field(default=0.0, repr=False)
    _original_attrs: dict = field(default_factory=dict, repr=False)


class TrafficSimulator:
    """
    Manages active traffic events and applies / reverts their effects on
    the road graph edge attributes (travel_time, congestion, availability).
    """

    def __init__(self, road_graph: RoadGraph):
        self.graph = road_graph
        self._events: Dict[int, TrafficEvent] = {}
        self._next_id = 1

    # ── public ───────────────────────────────────────────────────────────────

    def apply_event(
        self,
        event_type: str,
        edge_u: int,
        edge_v: int,
        delta_time: float = 0.0,
        delta_congestion: float = 0.0,
    ) -> TrafficEvent:
        """
        Apply a traffic event to the graph and return the event record.
        """
        G = self.graph.G
        event_type = EventType(event_type)

        # Snapshot original state
        orig_time = self.graph.get_edge_attr(edge_u, edge_v, "travel_time", 0.0)
        orig_cong = self.graph.get_edge_attr(edge_u, edge_v, "congestion", 0.0)
        orig_attrs = {}
        if G.has_edge(edge_u, edge_v):
            keys = list(G[edge_u][edge_v].keys())
            orig_attrs = dict(G[edge_u][edge_v][keys[0]])

        evt = TrafficEvent(
            event_id=self._next_id,
            event_type=event_type,
            edge_u=edge_u,
            edge_v=edge_v,
            delta_time=delta_time,
            delta_congestion=delta_congestion,
            road_closed=(event_type == EventType.road_closure),
            _original_travel_time=orig_time,
            _original_congestion=orig_cong,
            _original_attrs=orig_attrs,
        )
        self._next_id += 1

        # Apply effect to graph
        if event_type == EventType.road_closure:
            self.graph.remove_edge(edge_u, edge_v)
            logger.info("Event %d: Road closed (%d → %d)", evt.event_id, edge_u, edge_v)

        elif event_type == EventType.accident:
            new_time = orig_time + delta_time
            new_cong = min(100.0, orig_cong + delta_congestion)
            self.graph.set_edge_attr(edge_u, edge_v, "travel_time", new_time)
            self.graph.set_edge_attr(edge_u, edge_v, "congestion", new_cong)
            logger.info("Event %d: Accident on (%d → %d). time %.0f→%.0f cong %.0f→%.0f",
                        evt.event_id, edge_u, edge_v, orig_time, new_time, orig_cong, new_cong)

        elif event_type == EventType.congestion_spike:
            new_cong = min(100.0, orig_cong + delta_congestion)
            new_time = orig_time + delta_time
            self.graph.set_edge_attr(edge_u, edge_v, "congestion", new_cong)
            self.graph.set_edge_attr(edge_u, edge_v, "travel_time", new_time)
            logger.info("Event %d: Congestion spike on (%d → %d). cong %.0f→%.0f",
                        evt.event_id, edge_u, edge_v, orig_cong, new_cong)

        elif event_type == EventType.recovery:
            # Partial recovery: move values halfway towards base
            cur_time = self.graph.get_edge_attr(edge_u, edge_v, "travel_time", orig_time)
            cur_cong = self.graph.get_edge_attr(edge_u, edge_v, "congestion", orig_cong)
            new_time = (cur_time + orig_time) / 2
            new_cong = max(0.0, (cur_cong + orig_cong) / 2)
            self.graph.set_edge_attr(edge_u, edge_v, "travel_time", new_time)
            self.graph.set_edge_attr(edge_u, edge_v, "congestion", new_cong)
            logger.info("Event %d: Recovery on (%d → %d).", evt.event_id, edge_u, edge_v)

        self._events[evt.event_id] = evt
        return evt

    def resolve_event(self, event_id: int) -> bool:
        """Revert a traffic event and restore original edge conditions."""
        if event_id not in self._events:
            return False
        evt = self._events[event_id]
        if not evt.active:
            return False

        if evt.road_closed and evt._original_attrs:
            self.graph.restore_edge(evt.edge_u, evt.edge_v, evt._original_attrs)
        else:
            self.graph.set_edge_attr(evt.edge_u, evt.edge_v, "travel_time", evt._original_travel_time)
            self.graph.set_edge_attr(evt.edge_u, evt.edge_v, "congestion", evt._original_congestion)

        evt.active = False
        logger.info("Resolved event %d on edge (%d → %d)", event_id, evt.edge_u, evt.edge_v)
        return True

    def active_events(self) -> List[TrafficEvent]:
        return [e for e in self._events.values() if e.active]

    def all_events(self) -> List[TrafficEvent]:
        return list(self._events.values())

    def get_event(self, event_id: int) -> Optional[TrafficEvent]:
        return self._events.get(event_id)

    def edge_state(self, u: int, v: int) -> dict:
        """Return current edge attributes (travel_time, congestion, available)."""
        G = self.graph.G
        available = G.has_edge(u, v)
        return {
            "u": u, "v": v,
            "available": available,
            "travel_time": self.graph.get_edge_attr(u, v, "travel_time"),
            "congestion": self.graph.get_edge_attr(u, v, "congestion"),
            "length": self.graph.get_edge_attr(u, v, "length"),
        }
