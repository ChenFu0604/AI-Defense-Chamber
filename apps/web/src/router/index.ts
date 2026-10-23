import { createRouter, createWebHistory } from 'vue-router'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import HomeView from '../views/HomeView.vue'
import ProjectCreateView from '../views/ProjectCreateView.vue'
import ProjectDetailView from '../views/ProjectDetailView.vue'
import DefensePrepareView from '../views/DefensePrepareView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import DefenseSessionView from '../views/DefenseSessionView.vue'
import DefenseReportView from '../views/DefenseReportView.vue'
import SystemSettingsView from '../views/SystemSettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      children: [
        {path: 'tasks', name: 'improvement-tasks', component: () => import('../views/ImprovementTasksView.vue'), meta: {title: '改进任务'}},
        {
          path: 'projects', name: 'projects',
          component: () => import('../views/ProjectsView.vue'), meta: { title: '我的项目' },
        },
        {
          path: 'projects/:id/edit', name: 'project-edit',
          component: () => import('../views/ProjectEditView.vue'), meta: { title: '编辑项目' },
        },
        {
          path: 'history/projects/:id',
          name: 'history-project',
          component: () => import('../views/HistoryProjectView.vue'),
          meta: { title: '历史项目档案' },
        },
        {
          path: 'history',
          name: 'history',
          component: () => import('../views/HistoryView.vue'),
          meta: { title: '历史记录' },
        },
        {
          path: 'history/compare',
          name: 'history-compare',
          component: () => import('../views/HistoryCompareView.vue'),
          meta: { title: '评分对比' },
        },
        {
          path: 'history/:id/train',
          name: 'history-train',
          component: () => import('../views/HistoryTrainView.vue'),
          meta: { title: '二次训练' },
        },
        {
          path: 'history/:id',
          name: 'history-detail',
          component: () => import('../views/HistoryDetailView.vue'),
          meta: { title: '历史答辩报告' },
        },
        {
          path: 'projects/:id/risks',
          name: 'project-risks',
          component: () => import('../views/RiskMapView.vue'),
          meta: { title: '项目漏洞地图' },
        },
        {
          path: 'defense/sessions/:id/risks',
          name: 'session-risks',
          component: () => import('../views/RiskMapView.vue'),
          meta: { title: '答辩漏洞地图' },
        },
        {
          path: 'settings',
          name: 'system-settings',
          component: SystemSettingsView,
          meta: { title: '系统设置' },
        },
        {
          path: 'defense/sessions/:id',
          name: 'defense-session',
          component: DefenseSessionView,
          meta: { title: '动态答辩' },
        },
        {
          path: 'defense/sessions/:id/report',
          name: 'defense-report',
          component: DefenseReportView,
          meta: { title: '诊断报告' },
        },
        { path: '', name: 'home', component: HomeView, meta: { title: '总览' } },
        {
          path: 'projects/new',
          name: 'project-create',
          component: ProjectCreateView,
          meta: { title: '创建项目' },
        },
        {
          path: 'projects/:id',
          name: 'project-detail',
          component: ProjectDetailView,
          meta: { title: '项目详情' },
        },
        {
          path: 'defense',
          name: 'defense',
          component: DefensePrepareView,
          meta: { title: '答辩准备' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { title: '页面未找到' } },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 28 }
    if (to.name === 'defense' && from.name === 'defense') return { top: 0 }
    return { top: 0 }
  },
})
router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '总览')} · AI 答辩压力舱`
})
