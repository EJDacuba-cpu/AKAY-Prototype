# Frontend Architecture - Quick Reference

## 🏗️ Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    📄 Pages (Orchestration)                 │
│    Dashboard, Patients, HealthRecords, Referrals, etc.      │
│              • Fetch data with hooks                         │
│              • Pass to reusable components                   │
│              • Handle routing & navigation                   │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                   🪝 Custom Hooks (Logic)                    │
│  useFetch │ useDataTable │ useForm │ useAsyncOperation │...  │
│              • Extract complex logic                         │
│              • Manage state & side effects                   │
│              • Reusable across pages                         │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│               🧬 Components (Presentation)                   │
│                                                              │
│  Atoms          Molecules           Organisms               │
│  ├─ Button      ├─ EmptyState       ├─ DataTable           │
│  ├─ Badge       ├─ Alert            ├─ StatCard            │
│  ├─ Card        ├─ Modal            ├─ FormPanel           │
│  ├─ Input       ├─ Pagination       └─ (Complex UX)        │
│  ├─ Select      ├─ FilterBar                                │
│  └─ Spinner     └─ ActionMenu                               │
│                                                              │
│              • Pure presentational                          │
│              • Accept data via props                        │
│              • No business logic                            │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│              📡 Services (Business Logic)                    │
│  patients.js │ healthRecords.js │ referrals.js │ api.js    │
│                                                              │
│              • CRUD operations                              │
│              • API communication                            │
│              • Data transformations                         │
│              • Mock data (switchable to real API)           │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                   💾 Data Layer (Mock)                       │
│  mockPatients │ mockRecords │ mockReferrals │ mockData...   │
│                                                              │
│              • Demo/thesis purposes                         │
│              • Easy to replace with real API                │
│              • Consistent data format                       │
└──────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow

```
User Action (click, submit, etc.)
    ↓
Page Component
    ↓
Custom Hook (useFetch, useForm, etc.)
    ↓
Service Layer (patients.js, etc.)
    ↓
Mock Data OR API Client
    ↓
Return data/result
    ↓
Update component state
    ↓
Reusable Components render
    ↓
UI Updates (with animations)
```

## 📦 Component Hierarchy

```
Page (Dashboard)
├── Header Section
│   ├── Title (atoms)
│   └── Button (atoms)
├── Stats Section
│   ├── StatCard (organisms)
│   ├── StatCard (organisms)
│   ├── StatCard (organisms)
│   └── StatCard (organisms)
├── Filters Section
│   └── FilterBar (molecules)
└── Content Section
    ├── DataTable (organisms)
    │   ├── Table Header (atoms)
    │   ├── Table Rows (atoms)
    │   └── ActionMenu (molecules)
    └── Pagination (molecules)
```

## 🎯 Component Usage Examples

### Atomic Components

```jsx
// Simple, no state, no logic
<Button variant="primary" onClick={handleClick}>Click me</Button>
<Badge variant="success">Active</Badge>
<Card className="p-6">Content</Card>
<Input type="email" onChange={handleChange} />
```

### Molecule Components

```jsx
// No business logic, just UI coordination
<EmptyState icon={<Users />} title="No data" />
<Alert variant="success">Success message</Alert>
<Modal isOpen={isOpen} onClose={handleClose}>Content</Modal>
<Pagination currentPage={page} totalPages={10} onPageChange={setPage} />
```

### Organism Components

```jsx
// Complex feature components, still no business logic
<DataTable columns={cols} data={data} actions={actions} />
<StatCard title="Total" value={100} icon={<Icon />} />
<FormPanel title="Add Item" onSubmit={handleSubmit}>Form fields</FormPanel>
```

### Hooks (Logic)

```jsx
// Fetch data
const { data, loading } = useFetch(() => getPatients(), []);

// Table logic
const table = useDataTable(patients, { itemsPerPage: 10 });

// Form logic
const form = useForm(values, onSubmit, validators);

// Notifications
const notify = useNotification();
notify.success("Done!");
```

### Services (Data)

```jsx
// CRUD operations
const patients = await patientService.getPatients();
const patient = await patientService.getPatientById(id);
await patientService.createPatient(data);
await patientService.updatePatient(id, data);
await patientService.deletePatient(id);
```

## 🔗 Page Pattern (Clean Architecture)

```jsx
import { useFetch, useDataTable } from "@/hooks";
import { DataTable } from "@/components/organisms";
import * as patientService from "@/services/patients";

// ✅ GOOD - Clean orchestration
export default function PatientsPage() {
  // 1. Fetch data
  const { data: patients, loading } = useFetch(
    () => patientService.getPatients(),
    [],
  );

  // 2. Handle table logic
  const table = useDataTable(patients, { itemsPerPage: 10 });

  // 3. Just render components
  return (
    <Layout>
      <FilterBar values={table.filters} onChange={table.setFilters} />
      <DataTable data={table.paginatedData} loading={loading} />
    </Layout>
  );
}
```

## 📋 Checklist - When Building New Features

- [ ] Is it purely UI? → Use atomic components
- [ ] Does it combine multiple atoms? → Use molecule
- [ ] Is it a complex UI feature? → Use organism
- [ ] Does it need data/logic? → Use custom hook
- [ ] Is it calling an API? → Use service
- [ ] Needs state management? → Use custom hook
- [ ] Page just orchestrating? ✅ Perfect!

## 🚀 Common Patterns

### Pattern 1: List with Filters

```jsx
const { data } = useFetch(getPatients, []);
const table = useDataTable(data, { itemsPerPage: 10 });
return (
  <>
    <FilterBar values={table.filters} onChange={table.setFilters} />
    <DataTable data={table.paginatedData} />
    <Pagination {...table} />
  </>
);
```

### Pattern 2: Form Submission

```jsx
const { execute, loading } = useAsyncOperation(createPatient);
const form = useForm(values, execute, validators);
return (
  <FormPanel onSubmit={form.handleSubmit} isLoading={loading}>
    <FormGroup>
      <Input
        name="name"
        value={form.values.name}
        onChange={form.handleChange}
      />
    </FormGroup>
  </FormPanel>
);
```

### Pattern 3: Async Action with Notification

```jsx
const notify = useNotification();
const { execute, loading } = useAsyncOperation(deletePatient, {
  onSuccess: () => notify.success("Deleted!"),
  onError: (err) => notify.error(err.message),
});

const handleDelete = (id) => {
  if (confirm("Sure?")) execute(id);
};
```

### Pattern 4: Dashboard

```jsx
const { data: dashboardData, loading } = useFetch(async () => {
  const [stats, records, referrals] = await Promise.all([
    getStats(),
    getRecords(),
    getReferrals(),
  ]);
  return { stats, records, referrals };
}, []);

return (
  <>
    <StatCard {...dashboardData.stats} />
    <RecentRecords data={dashboardData.records} />
    <RecentReferrals data={dashboardData.referrals} />
  </>
);
```

## 📚 File Locations Quick Reference

| What                     | Where                   |
| ------------------------ | ----------------------- |
| Button, Badge, Input     | `components/atoms/`     |
| EmptyState, Alert, Modal | `components/molecules/` |
| DataTable, StatCard      | `components/organisms/` |
| useFetch, useDataTable   | `hooks/`                |
| getPatients, createUser  | `services/patients.js`  |
| Mock patient data        | `data/mock/patients.js` |
| formatDate, validators   | `utils/`                |

## 🎨 Styling Convention

All components use **Tailwind CSS** with consistent:

- **Navy** primary color: `#0B2E59` → `bg-[#0B2E59]`
- **Blue** secondary: `#2563EB` → `bg-blue-600`
- **Spacing scale**: 4px units
- **Rounded corners**: `rounded-lg`, `rounded-xl`, `rounded-2xl`
- **Shadows**: `shadow-sm`, `shadow-lg`
- **Animations**: `anim-fade-up`, `transition-all`

## 🧪 Testing Pattern

```jsx
// Component test
render(<Button>Click</Button>);
expect(screen.getByText("Click")).toBeInTheDocument();

// Hook test
renderHook(() => useForm(values, submit, validators));

// Service test
expect(await getPatients()).toEqual(mockPatients);
```

## 🔧 Troubleshooting Quick Reference

| Problem                  | Solution                       |
| ------------------------ | ------------------------------ |
| Component not updating   | Check hook dependencies        |
| Too many re-renders      | Use useCallback for handlers   |
| Data not loading         | Check service returns data     |
| Form not validating      | Check validators return string |
| Table showing wrong data | Check column keys match data   |
| Animations not working   | Check stagger() function call  |

## 📞 Quick Help

**Need to add a button?** → Use `Button` from atoms  
**Need to show empty state?** → Use `EmptyState` from molecules  
**Need a data table?** → Use `DataTable` from organisms  
**Need to fetch data?** → Use `useFetch` hook  
**Need form handling?** → Use `useForm` hook  
**Need to call backend?** → Use service functions

---

Keep it simple, follow patterns, stay consistent! ✨
