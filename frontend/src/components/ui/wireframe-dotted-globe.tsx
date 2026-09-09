"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"

interface RotatingEarthProps {
  width?: number
  height?: number
  className?: string
  isDark?: boolean
}

interface DotData {
  lng: number
  lat: number
  visible: boolean
}

// Module-level cache so we never re-fetch or re-calculate dots on theme toggle or re-mount
let cachedLandFeatures: any = null
let cachedDots: DotData[] = []

export default function RotatingEarth({
  width = 540,
  height = 540,
  className = "",
  isDark = true,
}: RotatingEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(!cachedLandFeatures)
  const [error, setError] = useState<string | null>(null)
  const isDarkRef = useRef(isDark)

  useEffect(() => {
    isDarkRef.current = isDark
  }, [isDark])

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const context = canvas.getContext("2d")
    if (!context) return

    // Measure container client bounds to ensure strict 1:1 square dimensions
    const cWidth = container.clientWidth || width
    const cHeight = container.clientHeight || height
    const maxScreen = Math.min(window.innerHeight - 140, window.innerWidth - 48)
    const size = Math.max(260, Math.floor(Math.min(width, height, cWidth, cHeight, maxScreen)))
    const radius = size / 2.25

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    canvas.style.maxWidth = "100%"
    canvas.style.maxHeight = "100%"
    canvas.style.aspectRatio = "1 / 1"
    context.scale(dpr, dpr)

    // Create projection and path generator for Canvas
    const projection = d3
      .geoOrthographic()
      .scale(radius)
      .translate([size / 2, size / 2])
      .clipAngle(90)

    const path = d3.geoPath().projection(projection).context(context)

    const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
      const [x, y] = point
      let inside = false

      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i]
        const [xj, yj] = polygon[j]

        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside
        }
      }

      return inside
    }

    const pointInFeature = (point: [number, number], feature: any): boolean => {
      const geometry = feature.geometry

      if (geometry.type === "Polygon") {
        const coordinates = geometry.coordinates
        if (!pointInPolygon(point, coordinates[0])) {
          return false
        }
        for (let i = 1; i < coordinates.length; i++) {
          if (pointInPolygon(point, coordinates[i])) {
            return false
          }
        }
        return true
      } else if (geometry.type === "MultiPolygon") {
        for (const polygon of geometry.coordinates) {
          if (pointInPolygon(point, polygon[0])) {
            let inHole = false
            for (let i = 1; i < polygon.length; i++) {
              if (pointInPolygon(point, polygon[i])) {
                inHole = true
                break
              }
            }
            if (!inHole) {
              return true
            }
          }
        }
        return false
      }

      return false
    }

    const generateDotsInPolygon = (feature: any, dotSpacing = 16) => {
      const dots: [number, number][] = []
      const bounds = d3.geoBounds(feature)
      const [[minLng, minLat], [maxLng, maxLat]] = bounds

      const stepSize = dotSpacing * 0.08

      for (let lng = minLng; lng <= maxLng; lng += stepSize) {
        for (let lat = minLat; lat <= maxLat; lat += stepSize) {
          const point: [number, number] = [lng, lat]
          if (pointInFeature(point, feature)) {
            dots.push(point)
          }
        }
      }

      return dots
    }

    const allDots: DotData[] = []
    let landFeatures: any = null

    const render = () => {
      if (!context || !landFeatures) return
      // Clear canvas buffer
      context.clearRect(0, 0, size, size)

      const currentScale = projection.scale()
      const scaleFactor = currentScale / radius
      const dark = isDarkRef.current

      // Draw ocean circle (globe background) - mathematically an exact circle
      context.beginPath()
      context.arc(size / 2, size / 2, currentScale, 0, 2 * Math.PI)
      context.fillStyle = dark ? "#000000" : "#ffffff"
      context.fill()
      context.strokeStyle = dark ? "#ffffff" : "#000000"
      context.lineWidth = 1.5 * scaleFactor
      context.stroke()

      if (landFeatures) {
        // Draw graticule
        const graticule = d3.geoGraticule()
        context.beginPath()
        path(graticule())
        context.strokeStyle = dark ? "#ffffff" : "#000000"
        context.lineWidth = 0.8 * scaleFactor
        context.globalAlpha = dark ? 0.18 : 0.12
        context.stroke()
        context.globalAlpha = 1

        // Draw land outlines
        context.beginPath()
        landFeatures.features.forEach((feature: any) => {
          path(feature)
        })
        context.strokeStyle = dark ? "#ffffff" : "#000000"
        context.lineWidth = 1 * scaleFactor
        context.stroke()

        // Draw halftone dots
        allDots.forEach((dot) => {
          const projected = projection([dot.lng, dot.lat])
          if (
            projected &&
            projected[0] >= 0 &&
            projected[0] <= size &&
            projected[1] >= 0 &&
            projected[1] <= size
          ) {
            context.beginPath()
            context.arc(projected[0], projected[1], 1.2 * scaleFactor, 0, 2 * Math.PI)
            context.fillStyle = dark ? "#999999" : "#444444"
            context.fill()
          }
        })
      }
    }

    const loadWorldData = async () => {
      // Use cached data if available for instant rendering
      if (cachedLandFeatures && cachedDots.length > 0) {
        landFeatures = cachedLandFeatures
        allDots.push(...cachedDots)
        render()
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        const response = await fetch(
          "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/110m/physical/ne_110m_land.json",
        )
        if (!response.ok) throw new Error("Failed to load land data")

        landFeatures = await response.json()

        // Generate dots for all land features
        landFeatures.features.forEach((feature: any) => {
          const dots = generateDotsInPolygon(feature, 16)
          dots.forEach(([lng, lat]) => {
            allDots.push({ lng, lat, visible: true })
          })
        })

        // Save to cache
        cachedLandFeatures = landFeatures
        cachedDots = [...allDots]

        render()
        setIsLoading(false)
      } catch {
        setError("Failed to load land map data")
        setIsLoading(false)
      }
    }

    // Set up rotation and interaction
    const rotation = [0, 0]
    let autoRotate = true
    const rotationSpeed = 0.5

    const rotate = () => {
      if (autoRotate) {
        rotation[0] += rotationSpeed
        projection.rotate(rotation as [number, number])
        render()
      }
    }

    // Auto-rotation timer
    const rotationTimer = d3.timer(rotate)

    const handleMouseDown = (event: MouseEvent) => {
      autoRotate = false
      const startX = event.clientX
      const startY = event.clientY
      const startRotation = [...rotation]

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const sensitivity = 0.5
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY

        rotation[0] = startRotation[0] + dx * sensitivity
        rotation[1] = startRotation[1] - dy * sensitivity
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]))

        projection.rotate(rotation as [number, number])
        render()
      }

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)

        setTimeout(() => {
          autoRotate = true
        }, 10)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
      const newRadius = Math.max(radius * 0.5, Math.min(radius * 3, projection.scale() * scaleFactor))
      projection.scale(newRadius)
      render()
    }

    canvas.addEventListener("mousedown", handleMouseDown)
    canvas.addEventListener("wheel", handleWheel)

    // Load world data
    loadWorldData()

    // Cleanup
    return () => {
      rotationTimer.stop()
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("wheel", handleWheel)
    }
  }, [width, height, isDark])

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 rounded-2xl border ${isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-neutral-100 text-neutral-700'} ${className}`}>
        <div className="text-center">
          <p className="font-semibold mb-2">Error loading Earth visualization</p>
          <p className="text-sm opacity-70">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center aspect-square ${className}`}
      style={{ aspectRatio: "1 / 1" }}
    >
      <canvas
        ref={canvasRef}
        className={`cursor-grab active:cursor-grabbing rounded-full block transition-opacity duration-700 ${
          isLoading ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        style={{ aspectRatio: "1 / 1" }}
      />
    </div>
  )
}
