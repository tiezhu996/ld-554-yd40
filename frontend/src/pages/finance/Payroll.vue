<template>
  <AppLayout>
    <div class="page-title">
      <h1>工资单</h1>
      <div class="actions">
        <StoreSelector @change="(value) => form.storeId = value as number" />
        <el-date-picker v-model="form.month" type="month" value-format="YYYY-MM" placeholder="选择月份" />
        <el-button v-permission="['OWNER','MANAGER']" type="primary" :loading="generating" @click="generate">生成工资单</el-button>
      </div>
    </div>
    <div class="panel filters">
      <StoreSelector @change="(value) => filters.storeId = value as number" />
      <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="月份" clearable />
      <el-button @click="load">筛选</el-button>
    </div>
    <div class="panel">
      <el-table :data="payrolls.list">
        <el-table-column prop="month" label="月份" />
        <el-table-column label="门店"><template #default="{ row }">{{ row.Store?.name ?? row.storeId }}</template></el-table-column>
        <el-table-column prop="employeeCount" label="计薪人数" />
        <el-table-column label="应付总额"><template #default="{ row }">{{ money(row.totalAmount) }}</template></el-table-column>
        <el-table-column prop="updatedAt" label="最近生成时间"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作"><template #default="{ row }"><el-button link type="primary" @click="showDetail(row.id)">明细</el-button></template></el-table-column>
      </el-table>
    </div>
    <el-drawer v-model="detailVisible" title="工资单明细" size="480px">
      <el-table :data="detail?.PayrollItems ?? []">
        <el-table-column label="员工"><template #default="{ row }">{{ row.Employee?.name ?? row.employeeId }}</template></el-table-column>
        <el-table-column label="工号"><template #default="{ row }">{{ row.Employee?.employeeNo ?? '-' }}</template></el-table-column>
        <el-table-column prop="confirmedShifts" label="已确认班次" />
        <el-table-column label="应付金额"><template #default="{ row }">{{ money(row.payableAmount) }}</template></el-table-column>
      </el-table>
      <div class="detail-total">合计：{{ money(detail?.totalAmount ?? 0) }}</div>
    </el-drawer>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AppLayout from '@/components/layout/AppLayout.vue';
import StoreSelector from '@/components/common/StoreSelector.vue';
import { usePayrollStore } from '@/stores/payrollStore';
import { fetchPayroll, generatePayroll } from '@/api/payroll';
import { money } from '@/utils/format';
import type { Payroll } from '@/types/payroll';

const payrolls = usePayrollStore();
const filters = reactive<{ storeId?: number; month?: string }>({});
const form = reactive<{ storeId?: number; month?: string }>({});
const generating = ref(false);
const detailVisible = ref(false);
const detail = ref<Payroll>();

async function load() {
  await payrolls.load({ ...filters });
}

async function generate() {
  if (!form.storeId || !form.month) {
    ElMessage.warning('请先选择门店和月份');
    return;
  }
  generating.value = true;
  try {
    await generatePayroll({ storeId: form.storeId, month: form.month });
    ElMessage.success('工资单已生成');
    await load();
  } finally {
    generating.value = false;
  }
}

async function showDetail(id: number) {
  const response = await fetchPayroll(id) as { data: Payroll };
  detail.value = response.data;
  detailVisible.value = true;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

onMounted(load);
</script>

<style scoped>
.actions {
  display: flex;
  gap: 12px;
}
.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}
.detail-total {
  margin-top: 16px;
  text-align: right;
  font-weight: 600;
}
</style>
