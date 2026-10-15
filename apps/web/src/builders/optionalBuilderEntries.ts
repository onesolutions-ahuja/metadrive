/**
 * Optional Builder entry points. Import this module from the application shell;
 * the editing implementations are fetched only after their boundaries render.
 *
 * Published pages, flows and dashboards must continue using their existing
 * lightweight runtime modules rather than importing these editor entry points.
 */
import { lazy } from 'react';

export const loadFlowBuilder = () => import('../FlowBuilder');
export const loadDashboardBuilder = () => import('../DashboardBuilder');
export const loadComponentLibrary = () => import('../ComponentLibrary');
export const loadPageComponentStyleEditor = () => import('../PageComponentStyleEditor');
export const loadPageComponentVisualEditor = () => import('../PageComponentVisualEditor');
export const loadCustomComponentPropertyEditor = () => import('../CustomComponentPropertyEditor');

export const LazyFlowBuilder = lazy(loadFlowBuilder);
export const LazyDashboardBuilder = lazy(loadDashboardBuilder);
export const LazyComponentLibrary = lazy(loadComponentLibrary);
export const LazyPageComponentStyleEditor = lazy(loadPageComponentStyleEditor);
export const LazyPageComponentVisualEditor = lazy(loadPageComponentVisualEditor);
export const LazyCustomComponentPropertyEditor = lazy(loadCustomComponentPropertyEditor);
