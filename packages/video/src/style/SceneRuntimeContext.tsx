import React, { createContext, useContext } from 'react';
import type { SceneWordToken } from './sceneRuntimeHelpers.js';

export interface SceneRuntimeValue {
  sceneIndex: number;
  totalScenes: number;
  isFirst: boolean;
  isLast: boolean;
  sceneStartMs: number;
  sceneEndMs: number;
  durationInFrames: number;
  words: readonly SceneWordToken[];
}

const DEFAULT_SCENE_RUNTIME: SceneRuntimeValue = {
  sceneIndex: 0,
  totalScenes: 1,
  isFirst: true,
  isLast: true,
  sceneStartMs: 0,
  sceneEndMs: 4000,
  durationInFrames: 120,
  words: [],
};

const SceneRuntimeContext = createContext<SceneRuntimeValue>(DEFAULT_SCENE_RUNTIME);

export const SceneRuntimeProvider: React.FC<{
  value: SceneRuntimeValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <SceneRuntimeContext.Provider value={value}>{children}</SceneRuntimeContext.Provider>;
};

export function useSceneRuntime(): SceneRuntimeValue {
  return useContext(SceneRuntimeContext);
}
