import { createRouter, createWebHistory } from 'vue-router'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import HomeView from '../views/HomeView.vue'
import ProjectCreateView from '../views/ProjectCreateView.vue'
import ProjectDetailView from '../views/ProjectDetailView.vue'
import DefensePrepareView from '../views/DefensePrepareView.vue'
import NotFoundView from '../views/NotFoundView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      children: [
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
