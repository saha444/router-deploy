import React, { useState, useEffect } from 'react';
import { useRouting } from '../../context/RoutingContext';
import { useTheme } from '../../context/ThemeContext';
import MapView, { VEHICLE_COLOURS } from '../../components/MapView';
import AddressAutocomplete, { type AddressSuggestion } from '../../components/AddressAutocomplete';
import type { OperationalPreference } from '../../types';

type WizardStep = 'fleet' | 'depot' | 'stops' | 'focus' | 'plan';

const PREFERENCE_CARDS: {
  id: OperationalPreference;
  title: string;
  subtitle: string;
  desc: string;
  tag: string;
}[] = [
  { id: 'fastest', title: 'FASTEST', subtitle: 'Minimize travel time', desc: 'Bypasses slow road segments to reach all destinations as quickly as possible.', tag: 'Min Time' },
  { id: 'shortest', title: 'SHORTEST', subtitle: 'Minimize road distance', desc: 'Reduces total road kilometres and fleet fuel consumption.', tag: 'Min Distance' },
  { id: 'low_congestion', title: 'LOW CONGESTION', subtitle: 'Avoid traffic bottlenecks', desc: 'Prioritizes free-flowing urban corridors and avoids delayed choke points.', tag: 'Free Flow' },
  { id: 'stable', title: 'STABLE', subtitle: 'Minimize route disruption', desc: 'Keeps dispatch paths predictable and avoids unnecessary path deviations.', tag: 'Robust Path' },
  { id: 'balanced', title: 'BALANCED', subtitle: 'Optimal trade-off', desc: 'Harmonious multi-objective compromise across time, distance, congestion, and disruption.', tag: 'Recommended' },
];

const RoutingPage: React.FC = () => {
  const { isDark } = useTheme();
  const {
    geojson, fleet, depot, stops, routes,
    activeVehicleId, selectedPreference, isOptimizing,
    mapClickMode, activeEvents, latestImpact,
    showRerouteDialog, alternativeRoutePreview,
    activeStopVehicleIdx,
    setMapClickMode, handleMapClick, addVehicle, removeVehicle, updateVehicle,
    setDepotCoords, addStopCoords, removeStop,
    setActiveVehicleId, saveAndOptimize, applyPreference,
    confirmReroute, dismissReroute, ensureNetwork,
    setActiveStopVehicleIdx, mapStopPickupWeight, setMapStopPickupWeight, mapStopDropoffWeight, setMapStopDropoffWeight,
  } = useRouting();

  const [currentStep, setCurrentStep] = useState<WizardStep>('fleet');
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleMaxWeight, setNewVehicleMaxWeight] = useState('');
  const [newVehicleCurrentWeight, setNewVehicleCurrentWeight] = useState('');
  const [newVehicleStatus, setNewVehicleStatus] = useState<'running' | 'dormant'>('running');
  const [isFleetConfirmed, setIsFleetConfirmed] = useState(false);
  const [depotAddressText, setDepotAddressText] = useState('');
  const [operationalFocus, setOperationalFocus] = useState<OperationalPreference>('balanced');

  const runningFleet = fleet.filter((v) => (v.status ?? 'running') === 'running');
  const totalRunningMaxCapacity = runningFleet.reduce((sum, v) => sum + (v.capacity || 0), 0);
  const totalStopsDemand = stops.reduce((sum, s) => sum + (s.demand || s.dropoff_weight || s.pickup_weight || 0), 0);
  const runningVehicleCount = runningFleet.length;
  const dormantVehicleCount = fleet.length - runningVehicleCount;

  const getVehicleWeightSummary = (vehicleIdx: number) => {
    const vehicle = fleet[vehicleIdx];
    if (!vehicle) return { currentWeight: 0, maxWeight: 0, stopsForVehicle: [] as typeof stops, isOverloaded: false, isUnderloaded: false, weightTrace: [] as { stopName: string; pickup: number; dropoff: number; weight: number; over: boolean; under: boolean }[], returnWeight: 0 };
    const stopsForVehicle = stops.filter((s) => s.vehicleIdx === vehicleIdx);
    let runningWeight = vehicle.currentWeight ?? 0;
    let isOverloaded = false;
    let isUnderloaded = false;
    const weightTrace: { stopName: string; pickup: number; dropoff: number; weight: number; over: boolean; under: boolean }[] = [];
    for (const stop of stopsForVehicle) {
      const pw = stop.pickup_weight || 0;
      const dw = stop.dropoff_weight || 0;
      runningWeight = runningWeight - dw + pw;
      // Clamp to 0 — weight can never go negative
      const under = runningWeight < 0;
      if (under) { isUnderloaded = true; runningWeight = 0; }
      const over = runningWeight > (vehicle.capacity || 0);
      if (over) isOverloaded = true;
      weightTrace.push({ stopName: stop.name ?? 'Stop', pickup: pw, dropoff: dw, weight: runningWeight, over, under });
    }
    return { currentWeight: vehicle.currentWeight ?? 0, maxWeight: vehicle.capacity || 0, stopsForVehicle, isOverloaded, isUnderloaded, weightTrace, returnWeight: runningWeight };
  };

  useEffect(() => {
    if (currentStep !== 'fleet') ensureNetwork();
  }, [currentStep, ensureNetwork]);

  useEffect(() => {
    if (currentStep === 'depot') setMapClickMode('place_depot');
    else if (currentStep === 'stops') setMapClickMode('place_stop');
    else setMapClickMode('none');
  }, [currentStep, setMapClickMode]);



  const handleAddVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newVehicleName.trim();
    const maxW = parseFloat(newVehicleMaxWeight);
    const curW = parseFloat(newVehicleCurrentWeight);
    if (!name || isNaN(maxW) || maxW <= 0) return;
    const currentW = isNaN(curW) ? 0 : Math.min(curW, maxW);
    addVehicle(name, maxW, currentW, newVehicleStatus);
    setNewVehicleName(''); setNewVehicleMaxWeight(''); setNewVehicleCurrentWeight(''); setNewVehicleStatus('running');
    setIsFleetConfirmed(false);
  };

  const handleSelectDepotAddress = async (item: AddressSuggestion) => {
    setDepotAddressText(item.name);
    await setDepotCoords(item.lat, item.lon);
  };

  const handleSelectStopAddress = async (item: AddressSuggestion) => {
    const pw = parseFloat(mapStopPickupWeight) || 0;
    const dw = parseFloat(mapStopDropoffWeight) || 0;
    if (pw === 0 && dw === 0) return;
    const summary = getVehicleWeightSummary(activeStopVehicleIdx);
    const projected = summary.returnWeight - dw + pw;
    // Block if would cause negative weight or exceed max
    if (projected < 0) return;
    if (projected > summary.maxWeight) return;
    await addStopCoords(item.lat, item.lon, pw, dw, activeStopVehicleIdx);
  };

  const handleRunOptimization = async () => {
    const success = await saveAndOptimize(operationalFocus);
    if (success) setCurrentStep('plan');
  };

  const ic = (extra = '') => `w-full px-4 py-2.5 rounded-xl border text-base outline-none transition-colors ${isDark ? 'bg-neutral-900 border-neutral-700 text-white focus:border-white' : 'bg-neutral-50 border-neutral-300 text-black focus:border-black'} ${extra}`;
  const borderCls = isDark ? 'border-[#222222]' : 'border-[#e5e5e5]';
  const bgCls = isDark ? 'bg-[#070707]' : 'bg-white';

  return (
    <div
      className={`h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-full flex flex-col font-garamond transition-colors duration-300 select-none overflow-hidden ${isDark ? 'bg-[#050505] text-[#fafafa]' : 'bg-[#fafafa] text-[#0a0a0a]'}`}
      style={{ fontFamily: '"EB Garamond", serif' }}
    >
      {/* Step Indicator */}
      <div className={`w-full px-6 md:px-14 py-3 border-b flex flex-wrap items-center justify-between gap-4 transition-colors shrink-0 ${isDark ? 'border-[#222222] bg-[#090909]/90' : 'border-[#e5e5e5] bg-[#f5f5f5]/90'} backdrop-blur-sm z-30`}>
        <div className="flex items-center gap-2 sm:gap-4 text-base overflow-x-auto py-1">
          {[
            { key: 'fleet', label: 'Fleet Setup', enabled: true },
            { key: 'depot', label: 'Depot Location', enabled: fleet.length > 0 },
            { key: 'stops', label: 'Stops per Vehicle', enabled: !!depot },
            { key: 'focus', label: 'Operational Focus', enabled: stops.length > 0 },
          ].map((step, i) => (
            <React.Fragment key={step.key}>
              {i > 0 && <span className="opacity-30">→</span>}
              <button
                onClick={() => { if (step.enabled) setCurrentStep(step.key as WizardStep); }}
                disabled={!step.enabled}
                className={`flex items-center gap-2 transition-opacity ${currentStep === step.key || (step.key === 'focus' && currentStep === 'plan') ? isDark ? 'text-white font-semibold underline underline-offset-4' : 'text-black font-semibold underline underline-offset-4' : step.enabled ? 'opacity-50 hover:opacity-100' : 'opacity-25 cursor-not-allowed'}`}
              >
                <span className="w-5 h-5 rounded-full border text-xs flex items-center justify-center">{i + 1}</span>
                <span>{step.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {currentStep === 'fleet' && <span className="opacity-70">{fleet.length} vehicles · {runningVehicleCount} running · {totalRunningMaxCapacity} kg capacity</span>}
          {currentStep === 'depot' && <span className="opacity-70">{depot ? `Depot at Node #${depot.node_id}` : 'Click map to place depot'}</span>}
          {currentStep === 'stops' && <span className="opacity-70">{stops.length} stops · {totalStopsDemand} kg demand</span>}
          {currentStep === 'plan' && (
            <button onClick={() => setCurrentStep('fleet')} className={`px-3 py-1 rounded-full border text-xs transition-all ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Modify Setup</button>
          )}
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col min-h-0 overflow-hidden">

        {/* STEP 1: FLEET */}
        {currentStep === 'fleet' && (
          <div className="flex-1 w-full overflow-y-auto sleek-scrollbar">
            <div className="max-w-5xl w-full mx-auto px-6 md:px-12 py-10 space-y-10">
              <div className="space-y-2 text-left">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Fleet Configuration</h1>
                <p className="text-lg opacity-75 max-w-2xl">Add vehicles to your fleet. Set a name, max weight capacity, current loaded weight, and operational status for each.</p>
              </div>

              <div className={`p-6 sm:p-8 rounded-2xl border transition-colors ${isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                <form onSubmit={handleAddVehicle} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Vehicle Name / ID</label>
                      <input type="text" value={newVehicleName} onChange={(e) => setNewVehicleName(e.target.value)} placeholder="e.g. Truck Alpha" className={ic()} />
                    </div>
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Max Weight (kg)</label>
                      <input type="number" min="1" value={newVehicleMaxWeight} onChange={(e) => setNewVehicleMaxWeight(e.target.value)} placeholder="e.g. 500" className={ic()} />
                    </div>
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Current Load (kg)</label>
                      <input type="number" min="0" value={newVehicleCurrentWeight} onChange={(e) => setNewVehicleCurrentWeight(e.target.value)} placeholder="e.g. 200" className={ic()} />
                    </div>
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Status</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setNewVehicleStatus('running')} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${newVehicleStatus === 'running' ? isDark ? 'bg-emerald-900/50 border-emerald-600 text-emerald-300' : 'bg-emerald-50 border-emerald-500 text-emerald-800' : isDark ? 'bg-neutral-900 border-neutral-700 text-neutral-400' : 'bg-neutral-50 border-neutral-300 text-neutral-500'}`}>Running</button>
                        <button type="button" onClick={() => setNewVehicleStatus('dormant')} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${newVehicleStatus === 'dormant' ? isDark ? 'bg-neutral-700/50 border-neutral-500 text-neutral-300' : 'bg-neutral-200 border-neutral-400 text-neutral-700' : isDark ? 'bg-neutral-900 border-neutral-700 text-neutral-400' : 'bg-neutral-50 border-neutral-300 text-neutral-500'}`}>Dormant</button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={!newVehicleName.trim() || !newVehicleMaxWeight || parseFloat(newVehicleMaxWeight) <= 0} className={`px-8 py-2.5 rounded-xl border text-base font-medium transition-all ${!newVehicleName.trim() || !newVehicleMaxWeight || parseFloat(newVehicleMaxWeight) <= 0 ? 'opacity-40 cursor-not-allowed border-neutral-700' : isDark ? 'bg-white text-black border-white hover:bg-neutral-200' : 'bg-black text-white border-black hover:bg-neutral-800'}`}>+ Add Vehicle</button>
                  </div>
                </form>
              </div>

              <div className="space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">Active Fleet Roster</h2>
                  <span className="text-sm opacity-70">{fleet.length} vehicles registered</span>
                </div>
                {fleet.length === 0 ? (
                  <div className={`p-8 rounded-2xl border text-center ${isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'}`}><p className="text-lg opacity-70">No vehicles added yet. Fill the form above to register vehicles.</p></div>
                ) : (
                  <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'}`}>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`border-b text-sm ${isDark ? 'border-neutral-800 text-neutral-400' : 'border-neutral-200 text-neutral-600'}`}>
                          <th className="py-3 px-4 font-normal">#</th>
                          <th className="py-3 px-4 font-normal">Vehicle Name</th>
                          <th className="py-3 px-4 font-normal">Max Weight</th>
                          <th className="py-3 px-4 font-normal">Current Load</th>
                          <th className="py-3 px-4 font-normal">Status</th>
                          <th className="py-3 px-4 text-right font-normal">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fleet.map((v, idx) => {
                          const isRunning = (v.status ?? 'running') === 'running';
                          const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
                          const dColour = colour === '#000000' && isDark ? '#ffffff' : colour;
                          return (
                            <tr key={idx} className={`border-b last:border-b-0 transition-colors ${isDark ? 'border-neutral-800/60 hover:bg-neutral-900/30' : 'border-neutral-200/60 hover:bg-neutral-50'}`}>
                              <td className="py-3 px-4 opacity-60 text-sm">{idx + 1}</td>
                              <td className="py-3 px-4 font-medium text-base"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dColour }} />{v.name}</div></td>
                              <td className="py-3 px-4 text-base"><span className="font-semibold">{v.capacity}</span> <span className="text-xs opacity-70">kg</span></td>
                              <td className="py-3 px-4 text-base"><span className="font-semibold">{v.currentWeight ?? 0}</span> <span className="text-xs opacity-70">kg</span></td>
                              <td className="py-3 px-4">
                                <button onClick={() => updateVehicle(idx, { status: isRunning ? 'dormant' : 'running' })} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all ${isRunning ? isDark ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50' : 'border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : isDark ? 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500' : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:border-neutral-400'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                  {isRunning ? 'Running' : 'Dormant'}
                                </button>
                              </td>
                              <td className="py-3 px-4 text-right"><button onClick={() => removeVehicle(idx)} className="text-sm opacity-60 hover:opacity-100 hover:text-red-500 transition-colors">Remove</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className={`p-5 border-t flex flex-wrap items-center justify-between gap-4 text-base ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                      <div><span className="opacity-70">Total Vehicles: </span><strong className="text-lg">{fleet.length}</strong>{dormantVehicleCount > 0 && <span className="text-xs opacity-50 ml-2">({dormantVehicleCount} dormant, excluded)</span>}</div>
                      <div><span className="opacity-70">Running Fleet Max Capacity: </span><strong className="text-xl">{totalRunningMaxCapacity} kg</strong></div>
                      <div><span className="opacity-70">Running Vehicles: </span><strong className="text-lg">{runningVehicleCount}</strong></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t flex flex-wrap items-center justify-between gap-4 border-neutral-800/40">
                <div>
                  {isFleetConfirmed
                    ? <span className="text-sm text-emerald-400">Fleet confirmed ({runningVehicleCount} running vehicles, {totalRunningMaxCapacity} kg total capacity).</span>
                    : <span className="text-sm opacity-60">Review your fleet and confirm to proceed to depot placement.</span>
                  }
                </div>
                <div className="flex items-center gap-3">
                  {isFleetConfirmed && <button onClick={() => setIsFleetConfirmed(false)} className={`px-5 py-2.5 rounded-full border text-base transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Edit Fleet</button>}
                  <button disabled={fleet.length === 0 || runningVehicleCount === 0} onClick={() => { setIsFleetConfirmed(true); setCurrentStep('depot'); }} className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${fleet.length === 0 || runningVehicleCount === 0 ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 shadow-xl' : 'bg-black text-white hover:bg-neutral-800 shadow-xl'}`}>Confirm Fleet & Proceed to Depot →</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: DEPOT */}
        {currentStep === 'depot' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
            <div className={`w-full lg:w-[440px] h-full p-6 sm:p-8 flex flex-col justify-between border-r text-left overflow-y-auto sleek-scrollbar shrink-0 ${borderCls} ${bgCls}`}>
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">Depot Location</h2>
                  <p className="text-base opacity-75 mt-1">Set the origin and return terminal for fleet and search address.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm opacity-80">Search Address</label>
                  <AddressAutocomplete placeholder="Search address, city, or street in India..." value={depotAddressText} onSelect={handleSelectDepotAddress} />
                </div>
                <div className={`p-4 rounded-xl border space-y-2 ${depot ? isDark ? 'border-white bg-neutral-900/50' : 'border-black bg-neutral-50' : isDark ? 'border-neutral-800 opacity-60' : 'border-neutral-300 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white border border-black" />Depot Terminal [D]</span>
                    {depot && <span className="text-xs font-mono text-emerald-400">Locked</span>}
                  </div>
                  {depot ? (
                    <div className="text-xs space-y-1 font-mono">
                      <div>Node ID: #{depot.node_id}</div>
                      <div>Latitude: {depot.lat.toFixed(5)}</div>
                      <div>Longitude: {depot.lon.toFixed(5)}</div>
                    </div>
                  ) : <p className="text-xs">Click directly on any road line on the map to drop the depot terminal pin.</p>}
                </div>
              </div>
              <div className="pt-6 border-t border-neutral-800/40 flex items-center justify-between gap-4 mt-6">
                <button onClick={() => setCurrentStep('fleet')} className={`px-4 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Back to Fleet</button>
                <button disabled={!depot} onClick={() => setCurrentStep('stops')} className={`px-6 py-2.5 rounded-full text-base font-medium transition-all ${!depot ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 shadow-xl' : 'bg-black text-white hover:bg-neutral-800 shadow-xl'}`}>Confirm Depot & Add Stops →</button>
              </div>
            </div>
            <div className="flex-1 h-full min-h-0 overflow-hidden relative">
              <MapView geojson={geojson} center={depot ? [depot.lat, depot.lon] : [22.5937, 78.9629]} zoom={depot ? 13 : 5} depot={depot} stops={stops} mapClickMode={mapClickMode} onMapClick={handleMapClick} />
            </div>
          </div>
        )}

        {/* STEP 3: STOPS PER VEHICLE */}
        {currentStep === 'stops' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
            <div className={`w-full lg:w-[460px] h-full p-6 sm:p-8 flex flex-col justify-between border-r text-left overflow-y-auto sleek-scrollbar shrink-0 ${borderCls} ${bgCls}`}>
              <div className="space-y-5">
                <div>
                  <h2 className="text-3xl font-semibold">Stops per Vehicle</h2>
                  <p className="text-base opacity-75 mt-1">Select a vehicle, set a weight change per stop, then click the map or search an address.</p>
                </div>

                {/* Vehicle Selector */}
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wider opacity-60">Select Active Vehicle:</span>
                  <div className="flex flex-col gap-1.5">
                    {fleet.map((v, idx) => {
                      const isRunning = (v.status ?? 'running') === 'running';
                      const isSelected = activeStopVehicleIdx === idx;
                      const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
                      const dColour = colour === '#000000' && isDark ? '#ffffff' : colour;
                      const summary = getVehicleWeightSummary(idx);
                      return (
                        <button key={idx} disabled={!isRunning} onClick={() => setActiveStopVehicleIdx(idx)}
                          className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${!isRunning ? 'opacity-30 cursor-not-allowed ' + (isDark ? 'border-neutral-800' : 'border-neutral-200') : isSelected ? isDark ? 'border-white bg-neutral-900' : 'border-black bg-neutral-100' : isDark ? 'border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900' : 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-100'}`}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dColour }} />
                            <div>
                              <div className="font-semibold text-sm">{v.name}</div>
                              <div className="opacity-60 text-[10px]">{isRunning ? `${summary.stopsForVehicle.length} stops · ${summary.currentWeight} → ${summary.returnWeight} kg` : 'Dormant — excluded'}</div>
                            </div>
                          </div>
                          {summary.isOverloaded && <span className="text-red-400 text-[10px] font-bold">OVERLOADED</span>}
                          {isSelected && isRunning && <span className="text-[10px] opacity-60">Active</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Weight Delta & Stop Details for Selected Vehicle */}
                {(() => {
                  const activeVeh = fleet[activeStopVehicleIdx];
                  const summary = getVehicleWeightSummary(activeStopVehicleIdx);
                  if (!activeVeh || (activeVeh.status ?? 'running') !== 'running') return null;
                  return (
                    <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[#0e0e0e] border-neutral-800' : 'bg-neutral-50 border-neutral-300'}`}>
                      <div className="text-sm font-semibold">{activeVeh.name} — Weight Tracking</div>
                      <div className="text-xs font-mono space-y-1 opacity-80">
                        <div className="flex justify-between"><span>Start load:</span><span>{summary.currentWeight} kg</span></div>
                        {summary.weightTrace.map((wt, i) => (
                          <div key={i} className={`flex justify-between ${wt.over ? 'text-red-400' : wt.under ? 'text-orange-400' : ''}`}>
                            <span>{wt.stopName}: +{wt.pickup} kg / -{wt.dropoff} kg</span>
                            <span>{wt.weight} kg {wt.over ? '(OVER MAX)' : wt.under ? '(CLAMPED → 0)' : ''}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1 border-t border-neutral-800/40 font-semibold">
                          <span>Return weight:</span>
                          <span className={summary.returnWeight > summary.maxWeight ? 'text-red-400' : 'text-emerald-400'}>{summary.returnWeight} / {summary.maxWeight} kg</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs opacity-70">Weight change at stop:</label>
                        <div className="flex items-center gap-2">
                          <input type="number" value={mapStopPickupWeight} onChange={(e) => setMapStopPickupWeight(e.target.value)} placeholder="Pickup (kg)" min="0" className={`w-full px-3 py-2 rounded-xl border text-sm outline-none font-semibold ${isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'}`} />
                          <input type="number" value={mapStopDropoffWeight} onChange={(e) => setMapStopDropoffWeight(e.target.value)} placeholder="Dropoff (kg)" min="0" className={`w-full px-3 py-2 rounded-xl border text-sm outline-none font-semibold ${isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'}`} />
                        </div>
                        {(() => {
                          const pw = parseFloat(mapStopPickupWeight) || 0;
                          const dw = parseFloat(mapStopDropoffWeight) || 0;
                          if (pw === 0 && dw === 0) return null;
                          const projected = summary.returnWeight - dw + pw;
                          const over = projected > summary.maxWeight;
                          const under = projected < 0;
                          return (
                            <p className={`text-[11px] ${over || under ? 'text-red-400' : 'text-emerald-400'}`}>
                              Next stop result: {Math.max(0, projected)} kg
                              {over ? ` — exceeds max (${summary.maxWeight} kg)` : under ? ' — would go negative (not allowed)' : ' — within limit'}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <label className="block text-sm opacity-80">Add Stop by Address</label>
                  <AddressAutocomplete placeholder="Search address or street..." onSelect={handleSelectStopAddress} />
                  <p className="text-xs opacity-50">Or click on the map to drop a stop for the selected vehicle.</p>
                </div>

                {/* Stops list for active vehicle */}
                {(() => {
                  const summary = getVehicleWeightSummary(activeStopVehicleIdx);
                  if (summary.stopsForVehicle.length === 0) return <div className={`p-4 rounded-xl border text-center opacity-60 text-xs ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>No stops added for this vehicle yet.</div>;
                  return (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wider opacity-60">{fleet[activeStopVehicleIdx]?.name} — {summary.stopsForVehicle.length} stops:</div>
                      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 sleek-scrollbar">
                        {summary.stopsForVehicle.map((stop, i) => {
                          const globalIdx = stops.indexOf(stop);
                          const pw = stop.pickup_weight || 0;
                          const dw = stop.dropoff_weight || 0;
                          return (
                            <div key={i} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                              <div><div className="font-semibold">{stop.name}</div><div className="opacity-60 font-mono">+{pw} kg / -{dw} kg</div></div>
                              <button onClick={() => removeStop(globalIdx)} className="text-xs opacity-50 hover:opacity-100 hover:text-red-500 transition-colors">Remove</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="pt-6 border-t border-neutral-800/40 flex items-center justify-between gap-4 mt-6">
                <button onClick={() => setCurrentStep('depot')} className={`px-4 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Back to Depot</button>
                <button disabled={stops.length === 0} onClick={() => setCurrentStep('focus')} className={`px-6 py-2.5 rounded-full text-base font-medium transition-all ${stops.length === 0 ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 shadow-xl' : 'bg-black text-white hover:bg-neutral-800 shadow-xl'}`}>Confirm Stops & Set Focus →</button>
              </div>
            </div>
            <div className="flex-1 h-full min-h-0 overflow-hidden relative">
              <MapView geojson={geojson} center={depot ? [depot.lat, depot.lon] : [22.5937, 78.9629]} zoom={depot ? 13 : 5} depot={depot} stops={stops} mapClickMode={mapClickMode} onMapClick={handleMapClick} />
            </div>
          </div>
        )}

        {/* STEP 4: OPERATIONAL FOCUS */}
        {currentStep === 'focus' && (
          <div className="flex-1 w-full overflow-y-auto sleek-scrollbar">
            <div className="max-w-5xl w-full mx-auto px-6 md:px-12 py-10 space-y-10 text-left">
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Select Operational Focus</h1>
                <p className="text-lg opacity-75 max-w-2xl">Choose the objective trade-off priority for the route optimization algorithm.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {PREFERENCE_CARDS.map((card) => {
                  const isSelected = operationalFocus === card.id;
                  return (
                    <button key={card.id} onClick={() => setOperationalFocus(card.id)} className={`p-6 rounded-2xl border text-left transition-all flex flex-col justify-between ${isSelected ? isDark ? 'border-white bg-neutral-900 shadow-2xl scale-[1.02]' : 'border-black bg-neutral-100 shadow-2xl scale-[1.02]' : isDark ? 'border-neutral-800 bg-[#0a0a0a] hover:border-neutral-600' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-mono ${isDark ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-700'}`}>{card.tag}</span>
                          {isSelected && <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${isDark ? 'border-white text-white' : 'border-black text-black'}`}>Selected</span>}
                        </div>
                        <h3 className="text-2xl font-semibold">{card.title}</h3>
                        <p className="text-sm font-medium opacity-80 mt-0.5">{card.subtitle}</p>
                        <p className="text-xs opacity-60 mt-3 leading-relaxed">{card.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className={`p-6 rounded-2xl border flex flex-wrap items-center justify-between gap-6 ${isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                <div className="space-y-1">
                  <div className="text-sm opacity-70">Ready to execute optimization:</div>
                  <div className="text-xl font-semibold">{runningVehicleCount} Running Vehicles · {stops.length} Stops · {totalStopsDemand} kg Total Demand</div>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentStep('stops')} className={`px-5 py-3 rounded-full border text-base transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Modify Stops</button>
                  <button onClick={handleRunOptimization} disabled={runningVehicleCount === 0 || stops.length === 0} className={`px-10 py-3.5 rounded-full text-xl font-medium tracking-wide transition-all duration-300 shadow-2xl ${runningVehicleCount === 0 || stops.length === 0 ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 hover:scale-105 active:scale-95' : 'bg-black text-white hover:bg-neutral-800 hover:scale-105 active:scale-95'}`}>Optimise Routes</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: DISPATCH PLAN */}
        {currentStep === 'plan' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
            <div className={`w-full lg:w-[460px] h-full p-6 sm:p-8 flex flex-col justify-between border-r text-left overflow-y-auto sleek-scrollbar shrink-0 ${borderCls} ${bgCls}`}>
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">Dispatch Plan</h2>
                  <p className="text-sm opacity-70">Optimized route solution</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pb-1 text-xs">
                  {PREFERENCE_CARDS.map((p) => (
                    <button key={p.id} onClick={() => applyPreference(p.id)} className={`px-3 py-1.5 rounded-full border transition-all ${selectedPreference === p.id ? isDark ? 'bg-white text-black border-white font-semibold' : 'bg-black text-white border-black font-semibold' : isDark ? 'border-neutral-800 text-neutral-400 hover:text-white' : 'border-neutral-300 text-neutral-600 hover:text-black'}`}>{p.title}</button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-wider opacity-60">Vehicle Itinerary ({routes.length} routes):</div>
                  {routes.length === 0 ? (
                    <div className={`p-6 rounded-xl border text-center opacity-70 text-sm ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>Generating dispatch paths...</div>
                  ) : (
                    <div className="space-y-3">
                      {routes.map((route, idx) => {
                        const vehicle = fleet[idx] || { name: `Vehicle ${idx + 1}`, capacity: 0, currentWeight: 0, status: 'running' as const };
                        const isSelected = activeVehicleId === route.vehicle_id;
                        const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
                        const vehicleStops = stops.filter((s) => s.vehicleIdx === idx);
                        const startWeight = vehicle.currentWeight ?? 0;
                        let runningW = startWeight;
                        let totalDropped = 0, totalPickup = 0;
                        for (const stop of vehicleStops) {
                          const pw = stop.pickup_weight || 0;
                          const dw = stop.dropoff_weight || 0;
                          runningW = runningW - dw + pw;
                          runningW = Math.max(0, runningW); // clamp — weight cannot go negative
                          totalDropped += dw;
                          totalPickup += pw;
                        }
                        const returnWeight = Math.max(0, runningW);
                        return (
                          <div key={route.route_id} onClick={() => setActiveVehicleId(isSelected ? null : route.vehicle_id)} className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? isDark ? 'border-white bg-neutral-900/90 shadow-xl' : 'border-black bg-neutral-100 shadow-xl' : isDark ? 'border-neutral-800 bg-[#0e0e0e] hover:border-neutral-700' : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colour }} />
                                <span className="font-semibold text-base">{vehicle.name}</span>
                              </div>
                              <span className="text-xs font-mono opacity-80">{vehicleStops.length} stop{vehicleStops.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="text-xs opacity-75 font-mono py-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-black/20 border-neutral-700' : 'bg-neutral-200 border-neutral-400'}`}>DEPOT</span>
                              {vehicleStops.map((stop, si) => (
                                <React.Fragment key={si}><span>→</span><span className={`px-1.5 py-0.5 rounded border ${isDark ? 'border-neutral-600' : 'border-neutral-400'}`}>{stop.name ?? `S${si + 1}`}</span></React.Fragment>
                              ))}
                              <span>→</span>
                              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-black/20 border-neutral-700' : 'bg-neutral-200 border-neutral-400'}`}>DEPOT</span>
                            </div>
                            <div className={`mt-2 pt-2 border-t text-xs space-y-0.5 font-mono ${isDark ? 'border-neutral-800/40' : 'border-neutral-200'}`}>
                              <div className="flex justify-between opacity-70"><span>Loaded at depot:</span><span>{startWeight} kg</span></div>
                              <div className="flex justify-between opacity-70"><span>Dropped off:</span><span>-{totalDropped} kg</span></div>
                              {totalPickup > 0 && <div className="flex justify-between opacity-70"><span>Picked up:</span><span>+{totalPickup} kg</span></div>}
                              <div className="flex justify-between font-semibold"><span>Returns with:</span><span className={returnWeight > (vehicle.capacity || 0) ? 'text-red-400' : 'text-emerald-400'}>{returnWeight} / {vehicle.capacity} kg</span></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-6 border-t border-neutral-800/40 mt-6 flex items-center justify-between">
                <button onClick={() => setCurrentStep('fleet')} className={`px-5 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Edit Fleet & Stops</button>
                <button onClick={() => window.print()} className={`px-4 py-2 rounded-full border text-xs transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Print Route Plan</button>
              </div>
            </div>
            <div className="flex-1 h-full min-h-0 overflow-hidden relative">
              <MapView geojson={geojson} center={depot ? [depot.lat, depot.lon] : [22.5937, 78.9629]} zoom={depot ? 12 : 5} depot={depot} stops={stops} routes={routes} activeVehicleId={activeVehicleId} activeEvents={activeEvents} />
            </div>
          </div>
        )}
      </div>

      {/* LOADING OVERLAY — Blur background, circular spinner */}
      {isOptimizing && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center backdrop-blur-xl bg-black/60 gap-6 font-garamond">
          <div className={`w-16 h-16 rounded-full border-4 border-t-transparent animate-spin ${isDark ? 'border-white' : 'border-black'}`} />
          <p className={`text-2xl font-normal tracking-wide ${isDark ? 'text-white' : 'text-black'}`}>Optimising Dispatch Routes</p>
        </div>
      )}

      {/* REROUTE DIALOG */}
      {showRerouteDialog && latestImpact && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-garamond">
          <div className={`max-w-lg w-full p-8 rounded-2xl border shadow-2xl space-y-6 ${isDark ? 'bg-[#0a0a0a] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'}`}>
            <div>
              <span className="text-xs uppercase tracking-wider text-red-400 font-bold">Traffic Event Detected</span>
              <h3 className="text-2xl font-semibold mt-1">Reroute Decision Analyzer</h3>
              <p className="text-sm opacity-70 mt-1">A traffic incident has increased corridor delay by +{latestImpact.delta_time.toFixed(1)} mins.</p>
            </div>
            {alternativeRoutePreview && (
              <div className={`p-4 rounded-xl border text-xs space-y-2 ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className="flex justify-between"><span>Current Delay Path:</span><strong>{alternativeRoutePreview.currentDuration.toFixed(1)} mins</strong></div>
                <div className="flex justify-between text-emerald-400"><span>Bypass Alternative:</span><strong>{alternativeRoutePreview.newDuration.toFixed(1)} mins (-{Math.abs(alternativeRoutePreview.diffMinutes).toFixed(1)}m)</strong></div>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <button onClick={dismissReroute} className={`px-5 py-2.5 rounded-full border text-sm ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Keep Current Route</button>
              <button onClick={confirmReroute} className={`px-6 py-2.5 rounded-full text-sm font-semibold ${isDark ? 'bg-white text-black hover:bg-neutral-200' : 'bg-black text-white hover:bg-neutral-800'}`}>Apply Reroute →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutingPage;
