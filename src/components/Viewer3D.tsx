import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Viewer3DProps {
  sessionUrls: Record<string, string>;
  activeSessionId: string | null;
  onStatsUpdate?: (payloadMB: number, memoryMB: number, splatsCount: number) => void;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({ sessionUrls, activeSessionId, onStatsUpdate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sparkRendererRef = useRef<SparkRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  const splatsRef = useRef<Record<string, SplatMesh>>({});
  const totalPayloadRef = useRef<number>(0);

  // Stats update interval
  useEffect(() => {
    if (!onStatsUpdate) return;

    const intervalId = setInterval(() => {
      let totalVisibleSplats = 0;
      
      Object.values(splatsRef.current).forEach(splat => {
        if (splat && splat.visible && splat.splats) {
          totalVisibleSplats += splat.splats.getNumSplats();
        }
      });
      
      // 32 bytes per splat/point as a baseline estimate for VRAM footprint
      const totalElements = totalVisibleSplats;
      const memoryMB = (totalElements * 32) / (1024 * 1024);
      onStatsUpdate(totalPayloadRef.current, memoryMB, totalElements);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [onStatsUpdate]);

  // Initialization
  useEffect(() => {
    if (!containerRef.current) return;

    // Setup basic Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1115); // match bg-color
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Adjust camera position so the splat is visible. You might need to tweak this
    camera.position.set(0, 2, 8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const sparkRenderer = new SparkRenderer({ renderer });
    sparkRendererRef.current = sparkRenderer;
    // DO NOT add to scene yet! Wait for at least one splat to load to avoid "No target" error in Spark 2.0.

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      sparkRenderer.dispose();
    };
  }, []);

  // Handle Splat Loading and Opacity Crossfading
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let mounted = true;

    Object.entries(sessionUrls).forEach(([id, url]) => {
      if (!splatsRef.current[id]) {
        console.log(`Loading splat for session ${id}: ${url}`);
        
        // Instantiate first to prevent duplicate loading
        const splat = new SplatMesh();
        splatsRef.current[id] = splat;

        // Use fetch to read Content-Length for network payload tracking
        fetch(url).then(async (response) => {
          const contentLength = response.headers.get('Content-Length');
          if (contentLength) {
            const bytes = parseInt(contentLength, 10);
            totalPayloadRef.current += bytes / (1024 * 1024);
          } else {
            // Fallback for blob URLs without Content-Length
            const blob = await response.clone().blob();
            totalPayloadRef.current += blob.size / (1024 * 1024);
          }

          const fileBytes = await response.arrayBuffer();
          if (!mounted) return;

          // Initialize the splat with the fetched bytes
          splat.asyncInitialize({ fileBytes }).then(() => {
            if (!mounted) return;
            console.log(`Splat initialized for session ${id}`);
            scene.add(splat);
            
            // Add spark renderer to scene if it's not already added
            if (sparkRendererRef.current && !scene.children.includes(sparkRendererRef.current)) {
               scene.add(sparkRendererRef.current);
            }
            
            // Re-evaluate visibility
            Object.entries(splatsRef.current).forEach(([sid, s]) => {
              if (s) s.visible = sid === activeSessionId;
            });
          });
        }).catch((err) => {
          console.error(`Failed to load splat for session ${id}:`, err);
        });
      }
    });

    // Simple visibility switch
    Object.entries(splatsRef.current).forEach(([id, splat]) => {
      if (splat) splat.visible = id === activeSessionId;
    });

    return () => {
      mounted = false;
    };
  }, [sessionUrls, activeSessionId]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
