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
