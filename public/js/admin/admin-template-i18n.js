(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- i18n 管理（「其他」→「i18n 管理」） -->
    <div v-if="activeSection === 'i18n'">
        <div class="module-header">
            <h4 class="module-title">{{ t('admin.i18n.title') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="outline" size="lg" @click="i18nPage.openCreateModal()">{{ t('admin.i18n.newLang') }}</pv-button>
                <pv-button variant="outline-danger" size="lg" :disabled="i18nPage.resetDisabled.value" @click="i18nPage.resetAll()">{{ t('admin.i18n.resetAll') }}</pv-button>
                <pv-button variant="glass" size="lg" :disabled="i18nPage.dirtyCount.value < 1 || i18nPage.saving.value" @click="i18nPage.save()">
                    {{ i18nPage.saving.value ? t('common.saving') : t('admin.i18n.save') }}{{ i18nPage.dirtyCount.value > 0 ? ' (' + i18nPage.dirtyCount.value + ')' : '' }}
                </pv-button>
            </div>
        </div>

        <!-- 语言选择 + 自定义语言操作 + 搜索 -->
        <div class="card mb-3">
            <div class="card-body">
                <div class="row g-2 align-items-end">
                    <div class="col-auto">
                        <label class="form-label">{{ t('admin.i18n.selectLang') }}</label>
                        <select class="form-select" style="min-width:200px" v-model="i18nPage.selectedCode.value" @change="i18nPage.load()">
                            <option v-for="l in i18nPage.languages.value" :key="l.code" :value="l.code">{{ l.name }}</option>
                        </select>
                    </div>
                    <div class="col-auto d-flex gap-2" v-if="i18nPage.isCustom.value">
                        <pv-button variant="outline" size="lg" @click="i18nPage.rename()">{{ t('admin.i18n.rename') }}</pv-button>
                        <pv-button variant="outline-danger" size="lg" @click="i18nPage.remove()">{{ t('common.delete') }}</pv-button>
                    </div>
                    <div class="col-auto ms-auto" style="min-width:260px">
                        <label class="form-label">{{ t('admin.i18n.search') }}</label>
                        <input type="text" class="form-control" v-model="i18nPage.search.value" :placeholder="t('admin.i18n.searchPh')">
                    </div>
                </div>
                <div class="text-muted small mt-2" v-if="i18nPage.languageMeta.value">{{ i18nPage.languageMeta.value }}</div>
            </div>
        </div>

        <div v-if="i18nPage.loading.value" class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">{{ t('common.loading') }}</span>
            </div>
        </div>
        <div v-else>
            <div v-for="cat in i18nPage.groups.value" :key="cat.key" class="notification-group mb-3">
                <div class="notification-group-header d-flex align-items-center gap-2 p-3" @click="i18nPage.toggleGroup(cat.key)" :title="cat.desc">
                    <span class="notification-group-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    </span>
                    <span class="fw-bold">{{ cat.label }}</span>
                    <small class="text-muted">（{{ cat.count }} 个词条）</small>
                    <span class="i18n-cat-desc">{{ cat.desc }}</span>
                    <span class="ms-auto notification-chevron">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="{ transform: i18nPage.collapsed[cat.key] === false ? 'rotate(90deg)' : 'rotate(0deg)' }"><polyline points="9 18 15 12 9 6"/></svg>
                    </span>
                </div>
                <div v-if="i18nPage.collapsed[cat.key] === false || i18nPage.search.value" class="notification-group-items">
                    <div v-for="row in cat.visible" :key="row.key" class="notification-item-row p-3">
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                            <code class="i18n-key-text" :title="row.key">{{ row.key }}</code>
                            <span v-if="row.is_new" class="i18n-badge i18n-badge--new">{{ t('admin.i18n.isNew') }}</span>
                            <span v-if="row.override && !row.dirty" class="i18n-badge i18n-badge--override">{{ t('admin.i18n.overridden') }}</span>
                            <span v-if="row.dirty" class="i18n-badge i18n-badge--dirty">{{ t('admin.i18n.dirty') }}</span>
                            <span class="ms-auto">
                                <pv-button v-if="i18nPage.rowOverridable(row)" variant="outline-danger" @click="i18nPage.restoreKey(row)">{{ t('admin.i18n.resetOne') }}</pv-button>
                            </span>
                        </div>
                        <div class="row g-2 align-items-center">
                            <div class="col-md-4">
                                <div class="i18n-original-text text-muted small" :title="row.original">{{ row.original }}</div>
                                <div v-if="row.zh !== undefined" class="i18n-zh-ref small" :title="row.zh">{{ t('admin.i18n.zhRef') }}：{{ row.zh }}</div>
                            </div>
                            <div class="col-md-8">
                                <input type="text" class="form-control form-control-sm i18n-edit-input" :class="{ 'i18n-edit-dirty': row.dirty }" :placeholder="row.original" :value="i18nPage.fieldValue(row)" @input="i18nPage.onFieldInput(row, $event)" autocomplete="off">
                            </div>
                        </div>
                    </div>
                    <div v-if="cat.hasMore" class="p-2 text-center">
                        <pv-button variant="outline" size="lg" @click="i18nPage.loadMore(cat.key)">{{ t('admin.i18n.loadMore') }}</pv-button>
                    </div>
                </div>
            </div>
            <div v-if="!i18nPage.groups.value.length && !i18nPage.loading.value" class="text-muted text-center py-4">
                {{ i18nPage.search.value ? t('admin.i18n.emptySearch') : t('admin.i18n.empty') }}
            </div>
        </div>

        <!-- 新建语言弹窗 -->
        <Teleport to="body">
            <div class="modal fade" id="i18nCreateModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">{{ t('admin.i18n.newLang') }}</h5>
                            <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                        </div>
                        <div class="modal-body">
                            <form @submit.prevent="i18nPage.createLang()">
                                <div class="mb-3">
                                    <label class="form-label">{{ t('admin.i18n.newLangName') }}</label>
                                    <input type="text" class="form-control" v-model="i18nPage.createForm.name" maxlength="64" :placeholder="t('admin.i18n.newLangNamePh')">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('admin.i18n.selectBase') }}</label>
                                    <select class="form-select" v-model="i18nPage.createForm.baseCode">
                                        <option v-for="l in i18nPage.systemLanguages.value" :key="l.code" :value="l.code">{{ l.name }}</option>
                                    </select>
                                    <small class="text-muted">{{ t('admin.i18n.selectBaseHint') }}</small>
                                </div>
                                <pv-button type="submit" variant="glass" :disabled="i18nPage.creating.value">
                                    {{ i18nPage.creating.value ? t('common.saving') : t('common.confirm') }}
                                </pv-button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
    `);
})();
