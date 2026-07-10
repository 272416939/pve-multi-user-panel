(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'overview'">
                    <h4 class="module-title">资源运行概况</h4>
                    <div class="row g-3 mb-4">
                        <div class="col-sm-6 col-md-3">
                            <div class="stat-card">
                                <div class="stat-card-head">
                                    <span class="stat-icon stat-icon-run"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                                    <span class="stat-label">虚拟机运行中</span>
                                </div>
                                <div class="stat-num">{{ userVms.filter(v => v.status && v.status.status === 'running').length }}</div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-md-3">
                            <div class="stat-card">
                                <div class="stat-card-head">
                                    <span class="stat-icon stat-icon-stop"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                                    <span class="stat-label">虚拟机已停止</span>
                                </div>
                                <div class="stat-num">{{ userVms.filter(v => !v.status || v.status.status !== 'running').length }}</div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-md-3">
                            <div class="stat-card">
                                <div class="stat-card-head">
                                    <span class="stat-icon stat-icon-run"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                                    <span class="stat-label">容器运行中</span>
                                </div>
                                <div class="stat-num">{{ userLxcContainers.filter(c => c.status && c.status.status === 'running').length }}</div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-md-3">
                            <div class="stat-card">
                                <div class="stat-card-head">
                                    <span class="stat-icon stat-icon-stop"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                                    <span class="stat-label">容器已停止</span>
                                </div>
                                <div class="stat-num">{{ userLxcContainers.filter(c => !c.status || c.status.status !== 'running').length }}</div>
                            </div>
                        </div>
                    </div>

                    <h4 class="module-title">资源分布</h4>
                    <div class="row g-4">
                        <div class="col-md-6">
                            <div class="overview-chart-card">
                                <div class="circle-wrap">
                                    <svg width="160" height="160" viewBox="-7 -7 144 144">
                                        <circle class="circle-bg" cx="65" cy="65" r="60"></circle>
                                        <circle class="circle-progress" :style="{ strokeDashoffset: circleVmOffset }" cx="65" cy="65" r="60" transform="rotate(-90 65 65)"></circle>
                                    </svg>
                                    <div class="circle-text">
                                        <div class="circle-num">{{ userVms.length }}</div>
                                        <div class="circle-name">虚拟机</div>
                                    </div>
                                </div>
                                <div class="chart-legend">
                                    <span class="legend-item"><span class="legend-dot dot-run"></span> 运行 {{ userVms.filter(v => v.status && v.status.status === 'running').length }}</span>
                                    <span class="legend-item"><span class="legend-dot dot-stop"></span> 停止 {{ userVms.filter(v => !v.status || v.status.status !== 'running').length }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="overview-chart-card">
                                <div class="circle-wrap">
                                    <svg width="160" height="160" viewBox="-7 -7 144 144">
                                        <circle class="circle-bg" cx="65" cy="65" r="60"></circle>
                                        <circle class="circle-progress" :style="{ strokeDashoffset: circleCtOffset, stroke: userLxcContainers.length > 0 ? '#36D399' : '#6B7280' }" cx="65" cy="65" r="60" transform="rotate(-90 65 65)"></circle>
                                    </svg>
                                    <div class="circle-text">
                                        <div class="circle-num">{{ userLxcContainers.length }}</div>
                                        <div class="circle-name">容器</div>
                                    </div>
                                </div>
                                <div class="chart-legend">
                                    <span class="legend-item"><span class="legend-dot dot-run"></span> 运行 {{ userLxcContainers.filter(c => c.status && c.status.status === 'running').length }}</span>
                                    <span class="legend-item"><span class="legend-dot dot-stop"></span> 停止 {{ userLxcContainers.filter(c => !c.status || c.status.status !== 'running').length }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 虚拟机管理区域 -->
                

`);
})();
