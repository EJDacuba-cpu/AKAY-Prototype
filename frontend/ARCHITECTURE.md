# Healthcare System Frontend Architecture Guide

## Overview

This is a professional, enterprise-grade React + Vite + Tailwind CSS frontend architecture for a healthcare coordination system. The architecture follows clean, scalable principles with clear separation of concerns.

## Directory Structure

```
src/
├── components/
│   ├── atoms/              # Smallest reusable UI pieces
│   │   ├── Button.jsx
│   │   ├── Badge.jsx
│   │   ├── Card.jsx
│   │   ├── Input.jsx
│   │   ├── Select.jsx
│   │   └── LoadingSpinner.jsx
│   ├── molecules/          # Combinations of atoms
│   │   ├── EmptyState.jsx
│   │   ├── Alert.jsx
│   │   ├── FormGroup.jsx
│   │   ├── Modal.jsx
│   │   ├── Pagination.jsx
│   │   ├── FilterBar.jsx
│   │   └── ActionMenu.jsx
│   ├── organisms/          # Complex feature components
│   │   ├── DataTable.jsx
│   │   ├── StatCard.jsx
│   │   └── FormPanel.jsx
│   └── [domain]/           # Domain-specific components
├── hooks/                  # Custom React hooks
│   ├── useFetch.js         # Generic data fetching
│   ├── useDataTable.js     # Table pagination & filtering
│   ├── useForm.js          # Form state management
│   ├── useAsyncOperation.js # Async operation handling
│   ├── useNotification.js  # Toast notifications
│   └── usePatients.js      # Domain-specific hook
├── services/               # Business logic & API calls
│   ├── api.js              # Base API client
│   ├── patients.js         # Patient CRUD operations
│   ├── healthRecords.js    # Health records operations
│   ├── referrals.js        # Referrals operations
│   └── dashboard.js        # Dashboard data
├── data/
│   ├── mock/               # Mock data for development
│   │   ├── patients.js
│   │   ├── healthRecords.js
│   │   ├── referrals.js
│   │   ├── dashboard.js
│   │   └── index.js
│   └── types.js            # Type definitions/JSDoc
├── utils/                  # Utility functions
│   ├── animations.js       # Animation helpers
│   ├── dates.js            # Date formatting
│   ├── validators.js       # Validation rules
│   └── formatters.js       # Data formatting
├── pages/                  # Page components (orchestration only)
│   ├── admin/
│   ├── bhc/
│   └── rhu/
├── layouts/                # Layout components
└── App.jsx                 # Main app component
```

## Architecture Layers

### 1. **Atomic Components** (`components/atoms/`)

Smallest, most reusable UI components with no business logic.

**Examples:**

- `Button` - Reusable button with variants
- `Badge` - Display labels and tags
- `Card` - Container for content
- `Input` - Form input field
- `Select` - Dropdown select
- `LoadingSpinner` - Loading state indicator

**Usage:**

```jsx
import { Button, Badge, Input } from '@/components/atoms';

<Button variant="primary" onClick={handleClick}>
  Click me
</Button>

<Badge variant="success">Active</Badge>

<Input
  type="email"
  label="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

### 2. **Molecule Components** (`components/molecules/`)

Combinations of atoms that provide UI functionality without business logic.

**Examples:**

- `EmptyState` - Display when no data
- `Alert` - Notification/alert box
- `FormGroup` - Label + input + error
- `Modal` - Dialog overlay
- `Pagination` - Navigate pages
- `FilterBar` - Multiple filter inputs
- `ActionMenu` - Dropdown menu

**Usage:**

```jsx
import { EmptyState, Modal, Pagination } from '@/components/molecules';

<EmptyState
  icon={<Users size={48} />}
  title="No patients found"
  description="Try adjusting your filters"
  action={<Button onClick={handleAdd}>Add Patient</Button>}
/>

<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirm">
  <p>Are you sure?</p>
</Modal>

<Pagination
  currentPage={page}
  totalPages={10}
  onPageChange={setPage}
/>
```

### 3. **Organism Components** (`components/organisms/`)

Complex, feature-rich components combining atoms and molecules.

**Examples:**

- `DataTable` - Complete data table with pagination and actions
- `StatCard` - Statistics card with animation
- `FormPanel` - Complete form container with actions

**Usage:**

```jsx
import { DataTable, StatCard, FormPanel } from '@/components/organisms';

<DataTable
  columns={[
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' }
  ]}
  data={patients}
  loading={loading}
  actions={[
    { label: 'Edit', onClick: (row) => editPatient(row.id) }
  ]}
/>

<StatCard
  title="Total Patients"
  value={2435}
  icon={<Users size={20} />}
  color="navy"
  trend="+12%"
/>

<FormPanel
  title="Add Patient"
  onSubmit={handleSubmit}
  onCancel={handleCancel}
>
  {/* Form fields */}
</FormPanel>
```

### 4. **Custom Hooks** (`hooks/`)

Reusable logic and state management hooks.

#### `useFetch` - Generic Data Fetching

```jsx
const { data, loading, error, refetch } = useFetch(() => fetchPatients(), [], {
  onSuccess: (data) => console.log(data),
});
```

#### `useDataTable` - Pagination & Filtering

```jsx
const table = useDataTable(patients, {
  itemsPerPage: 10,
  initialFilters: { search: "", type: "All" },
});

// Use: table.paginatedData, table.currentPage, table.filters, etc.
```

#### `useForm` - Form State Management

```jsx
const form = useForm(
  { name: "", email: "" },
  (values) => createPatient(values),
  {
    email: validators.email,
    name: validators.required,
  },
);

// Use: form.values, form.handleChange, form.errors, form.handleSubmit
```

#### `useAsyncOperation` - Async Operation Handling

```jsx
const { execute, loading, error } = useAsyncOperation(
  (id) => deletePatient(id),
  { onSuccess: () => refetch() },
);
```

#### `useNotification` - Toast Notifications

```jsx
const notify = useNotification();

notify.success("Patient created!");
notify.error("Failed to create patient");
notify.info("Processing...");
```

### 5. **Services Layer** (`services/`)

Business logic and API integration.

**Service Pattern:**

```jsx
// services/patients.js
export async function getPatients() {
  // Mock: return mockPatients;
  // Real: return apiClient.get('/patients');
}

export async function createPatient(data) {
  // Mock data handling or real API call
}

export async function updatePatient(id, data) {
  // Update logic
}

export async function deletePatient(id) {
  // Delete logic
}
```

**Usage in Components:**

```jsx
import { useFetch } from "@/hooks";
import * as patientService from "@/services/patients";

export default function PatientsList() {
  const { data: patients, loading } = useFetch(
    () => patientService.getPatients(),
    [],
  );

  return <DataTable data={patients} loading={loading} />;
}
```

### 6. **Mock Data** (`data/mock/`)

Centralized mock data for development and demo purposes.

**Structure:**

```jsx
// data/mock/patients.js
export const mockPatients = [
  /* data */
];

// data/mock/index.js
export { mockPatients } from "./patients";
export { mockHealthRecords } from "./healthRecords";
// ... all mock data exports
```

**Easy to Switch:**

```jsx
// services/patients.js
import { mockPatients } from "@/data/mock";

export async function getPatients() {
  // Development: mock data
  await delay();
  return mockPatients;

  // Production: real API
  // return apiClient.get('/patients');
}
```

### 7. **Pages** (`pages/`)

**Pages are orchestration only** - they don't contain business logic.

**Bad Pattern (before):**

```jsx
export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [filters, setFilters] = useState({ search: '', type: 'All' });
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Complex fetching logic
  }, [filters, currentPage]);

  // Complex filtering logic
  const filtered = useMemo(() => { /* ... */ }, [patients, filters]);

  return (
    // Complex JSX with inline logic
  );
}
```

**Good Pattern (after):**

```jsx
import { useFetch, useDataTable, useNotification } from "@/hooks";
import { DataTable, StatCard } from "@/components/organisms";
import { getPatients } from "@/services/patients";

export default function PatientsPage() {
  // Data fetching
  const { data: patients, loading } = useFetch(() => getPatients(), []);

  // Table logic (pagination, filtering)
  const table = useDataTable(patients, { itemsPerPage: 10 });

  // Notifications
  const notify = useNotification();

  return (
    <DashboardLayout title="Patients">
      <Header title="Patients" stats={stats} />

      <FilterBar
        filters={filterDefinitions}
        values={table.filters}
        onChange={table.setFilters}
      />

      <DataTable
        columns={columns}
        data={table.paginatedData}
        loading={loading}
        actions={actions}
      />

      <Pagination
        currentPage={table.currentPage}
        totalPages={table.totalPages}
        onPageChange={table.setCurrentPage}
      />
    </DashboardLayout>
  );
}
```

## Common Patterns

### Data Fetching Page

```jsx
import { useFetch } from "@/hooks";
import { DataTable, LoadingSpinner } from "@/components";
import { getPatients } from "@/services/patients";

export default function Page() {
  const { data, loading, error, refetch } = useFetch(() => getPatients(), []);

  if (loading) return <LoadingSpinner />;
  if (error) return <Alert variant="error">{error}</Alert>;

  return <DataTable data={data} onRefresh={refetch} />;
}
```

### Form Page

```jsx
import { useForm, useAsyncOperation, useNotification } from "@/hooks";
import { FormPanel, FormGroup, Input, Select } from "@/components";
import { createPatient } from "@/services/patients";
import { validators } from "@/utils/validators";

export default function AddPatientPage() {
  const notify = useNotification();
  const { execute: submitForm, loading } = useAsyncOperation(
    (values) => createPatient(values),
    {
      onSuccess: () => {
        notify.success("Patient created!");
        navigate("/patients");
      },
      onError: (err) => notify.error(err.message),
    },
  );

  const form = useForm({ name: "", email: "", age: "" }, submitForm, {
    name: validators.required,
    email: validators.email,
    age: validators.age,
  });

  return (
    <FormPanel
      title="Add Patient"
      onSubmit={form.handleSubmit}
      isLoading={loading}
    >
      <FormGroup label="Name" error={form.errors.name} required>
        <Input
          type="text"
          name="name"
          value={form.values.name}
          onChange={form.handleChange}
        />
      </FormGroup>
      {/* More fields */}
    </FormPanel>
  );
}
```

### Table with Filters and Pagination

```jsx
import { useFetch, useDataTable } from "@/hooks";
import { DataTable, FilterBar, Pagination } from "@/components";

export default function PatientsPage() {
  const { data: patients } = useFetch(() => getPatients(), []);
  const table = useDataTable(patients, { itemsPerPage: 10 });

  return (
    <>
      <FilterBar
        filters={[
          { key: "search", label: "Search", type: "text" },
          { key: "status", label: "Status", type: "select", options: statuses },
        ]}
        values={table.filters}
        onChange={table.setFilters}
      />

      <DataTable data={table.paginatedData} />

      <Pagination
        currentPage={table.currentPage}
        totalPages={table.totalPages}
        onPageChange={table.setCurrentPage}
      />
    </>
  );
}
```

## Migration Guide

### Step 1: Replace Old Components

Replace old component imports with new atomic/molecule components.

### Step 2: Extract Logic to Hooks

Move state management and side effects to custom hooks.

### Step 3: Use Services

Call business logic through service layer, not directly in components.

### Step 4: Simplify Pages

Pages should only orchestrate, not contain logic.

## API Integration

### Switching from Mock to Real API

**Current (Mock):**

```jsx
// services/patients.js
export async function getPatients() {
  await delay(); // Mock delay
  return mockPatients; // Mock data
}
```

**Real API:**

```jsx
// services/patients.js
export async function getPatients() {
  return apiClient.get("/patients"); // Real API call
}
```

### API Client Usage

```jsx
import apiClient from "@/services/api";

// GET
const data = await apiClient.get("/endpoint");

// POST
const created = await apiClient.post("/endpoint", { data });

// PUT
const updated = await apiClient.put("/endpoint/id", { data });

// DELETE
await apiClient.delete("/endpoint/id");
```

## Best Practices

1. **Keep Pages Simple** - Pages orchestrate, don't implement logic
2. **Use Custom Hooks** - Extract reusable logic to hooks
3. **Service Layer** - All API calls and business logic in services
4. **Component Hierarchy** - atoms → molecules → organisms → pages
5. **Props Documentation** - Document component props with JSDoc
6. **Error Handling** - Handle errors in services and notify in UI
7. **Loading States** - Show loading spinners during async operations
8. **Validation** - Validate forms before submission
9. **Accessibility** - Use semantic HTML and ARIA labels
10. **Performance** - Use useMemo for expensive calculations

## Testing Strategy

### Component Testing

```jsx
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/atoms";

test("Button renders with text", () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText("Click me")).toBeInTheDocument();
});
```

### Hook Testing

```jsx
import { renderHook, act } from "@testing-library/react";
import { useForm } from "@/hooks";

test("useForm handles submission", () => {
  const { result } = renderHook(() => useForm({ name: "" }, jest.fn()));

  act(() => {
    result.current.handleChange({ target: { name: "name", value: "John" } });
  });

  expect(result.current.values.name).toBe("John");
});
```

### Service Testing

```jsx
import * as patientService from "@/services/patients";

test("getPatients returns array", async () => {
  const patients = await patientService.getPatients();
  expect(Array.isArray(patients)).toBe(true);
});
```

## Performance Optimization

1. **Code Splitting** - Use React.lazy for route-based splitting
2. **Memoization** - Use useMemo for expensive calculations
3. **Lazy Images** - Use native lazy loading
4. **Bundle Analysis** - Monitor bundle size regularly
5. **Caching** - Cache API responses when appropriate

## Maintenance

### Adding New Features

1. Create atomic components if needed
2. Compose into molecules/organisms
3. Add custom hooks for logic
4. Extend service layer
5. Create page orchestrating components

### Updating Existing Features

1. Keep components pure
2. Update hooks for logic changes
3. Update services for data changes
4. Test pages with new logic

## Troubleshooting

**Problem:** Component is re-rendering too often
**Solution:** Use useMemo, useCallback, or check dependencies

**Problem:** Data isn't updating
**Solution:** Check service calls, verify data flow in hooks

**Problem:** Forms not validating
**Solution:** Check validators, ensure form hook is properly configured

---

For questions or issues, refer to specific component documentation in their JSDoc comments.
