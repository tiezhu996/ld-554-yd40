<template>
  <div>
    <div class="payroll-toolbar">
      <StoreSelector @change="(value) => (form.storeId = value as number)" />
      <el-date-picker v-model="form.month" type="month" value-format="YYYY-MM" placeholder="选择月份" />
      <el-button v-permission="['OWNER','MANAGER']" type="primary" :loading="generating" @click="generate">生成工资单</el-button>
    </div>
    <el-table :data="list" row-key="id">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.items ?? []" size="small">
            <el-table-column prop="employeeName" label="员工" />
            <el-table-column label="月薪"><template #default="{ row: item }">{{ money(item.monthlySalary) }}</template></el-table-column>
            <el-table-column prop="confirmedDays" label="已确认出勤天数" />
            <el-table-column label="应付金额"><template #default="{ row: item }">{{ money(item.amount) }}</template></el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column prop="month" label="月份" />
      <el-table-column label="门店"><template #default="{ row }">{{ storeName(row.storeId) }}</template></el-table-column>
      <el-table-column prop="employeeCount" label="计薪人数" />
      <el-table-column label="工资总额"><template #default="{ row }">{{ money(row.totalAmount) }}</template></el-table-column>
    </el-table>
    <EmptyState v-if="!list.length" text="暂无工资单，选择门店和月份后点击生成" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import StoreSelector from '@/components/common/StoreSelector.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { fetchPayrolls, generatePayroll } from '@/api/payroll';
import { useStoreStore } from '@/stores/storeStore';
import { money } from '@/utils/format';
import type { Payroll } from '@/types/payroll';

const stores = useStoreStore();
const list = ref<Payroll[]>([]);
const generating = ref(false);
const form = reactive<{ storeId?: number; month: string }>({ storeId: undefined, month: new Date().toISOString().slice(0, 7) });

function storeName(storeId: number) {
  return stores.list.find((store) => store.id === storeId)?.name ?? `#${storeId}`;
}

async function load() {
  const response = (await fetchPayrolls({ pageSize: 50 })) as { data: { list: Payroll[] } };
  list.value = response.data.list;
}

async function generate() {
  if (!form.storeId || !form.month) {
    ElMessage.warning('请先选择门店和月份');
    return;
  }
  generating.value = true;
  try {
    await generatePayroll({ storeId: form.storeId, month: form.month });
    ElMessage.success('工资单已生成，重复生成会自动补算而不会重复计薪');
    await load();
  } finally {
    generating.value = false;
  }
}

onMounted(async () => {
  await stores.load();
  await load();
});
</script>

<style scoped>
.payroll-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}
</style>
