# Refactoring Implementation Guide

## Quick Start

### Step 1: Update Your Existing Pages

Replace old pages with new refactored versions using the new architecture.

**Example: Converting PatientsModule**

**Before (Old Pattern):**

```jsx
// ❌ Old - Complex logic in component
export default function PatientsModule() {
  const [patients, setPatients] = useState([]);
  const [filters, setFilters] = useState({...});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getPatients();
        setPatients(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Complex filtering logic inline
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      // ... filter logic
    });
  }, [patients, filters]);

  // Pagination logic inline
  const totalPages = Math.ceil(filteredPatients.length / 10);
  const startIndex = (currentPage - 1) * 10;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + 10);

  return (
    <DashboardLayout>
      {/* Inline JSX with business logic mixed */}
    </DashboardLayout>
  );
}
```

**After (New Pattern):**

```jsx
// ✅ New - Clean, orchestration-focused
import { useFetch, useDataTable } from '@/hooks';
import { DataTable } from '@/components/organisms';
import { getPatients } from '@/services/patients';

export default function PatientsModule() {
  // Data fetching - single line
  const { data: patients, loading } = useFetch(
    () => getPatients(),
    []
  );

  // Table logic - single line
  const table = useDataTable(patients, { itemsPerPage: 10 });

  return (
    <DashboardLayout>
      <FilterBar {...} />
      <DataTable data={table.paginatedData} />
      <Pagination {...} />
    </DashboardLayout>
  );
}
```

### Step 2: Create New Components as Needed

Use atomic components and compose them together.

**Example: Creating a Patient Form**

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

  const form = useForm(
    {
      firstName: "",
      lastName: "",
      email: "",
      age: "",
    },
    submitForm,
    {
      firstName: validators.required,
      lastName: validators.required,
      email: validators.email,
      age: validators.age,
    },
  );

  return (
    <FormPanel
      title="Add New Patient"
      onSubmit={form.handleSubmit}
      isLoading={loading}
    >
      <FormGroup label="First Name" required error={form.errors.firstName}>
        <Input
          type="text"
          name="firstName"
          value={form.values.firstName}
          onChange={form.handleChange}
        />
      </FormGroup>

      <FormGroup label="Last Name" required error={form.errors.lastName}>
        <Input
          type="text"
          name="lastName"
          value={form.values.lastName}
          onChange={form.handleChange}
        />
      </FormGroup>

      <FormGroup label="Email" required error={form.errors.email}>
        <Input
          type="email"
          name="email"
          value={form.values.email}
          onChange={form.handleChange}
        />
      </FormGroup>

      <FormGroup label="Age" required error={form.errors.age}>
        <Input
          type="number"
          name="age"
          value={form.values.age}
          onChange={form.handleChange}
        />
      </FormGroup>
    </FormPanel>
  );
}
```

### Step 3: Verify All Features Work

Test the refactored pages to ensure:

- ✅ Data loads correctly
- ✅ Filters work
- ✅ Pagination works
- ✅ Animations are smooth
- ✅ Forms submit correctly
- ✅ Error states display
- ✅ Responsive design preserved

## Refactoring Checklist

- [ ] **Structure**
  - [ ] Created `components/atoms/` folder
  - [ ] Created `components/molecules/` folder
  - [ ] Created `components/organisms/` folder
  - [ ] Created `data/mock/` folder
  - [ ] Created `services/` folder with CRUD services
  - [ ] Created enhanced `hooks/` folder

- [ ] **Components**
  - [ ] Atomic components created (Button, Badge, Input, etc.)
  - [ ] Molecule components created (EmptyState, Alert, Modal, etc.)
  - [ ] Organism components created (DataTable, StatCard, FormPanel)
  - [ ] All components have JSDoc props documentation
  - [ ] Components accept className for styling

- [ ] **Hooks**
  - [ ] `useFetch` for data fetching
  - [ ] `useDataTable` for table logic
  - [ ] `useForm` for form state
  - [ ] `useAsyncOperation` for async operations
  - [ ] `useNotification` for toast notifications
  - [ ] Domain-specific hooks (usePatients, etc.)

- [ ] **Services**
  - [ ] `api.js` base client created
  - [ ] `patients.js` CRUD operations
  - [ ] `healthRecords.js` CRUD operations
  - [ ] `referrals.js` CRUD operations
  - [ ] `dashboard.js` dashboard data
  - [ ] All services support mock and real API

- [ ] **Data**
  - [ ] Mock data moved to `data/mock/`
  - [ ] Central `data/mock/index.js` export
  - [ ] All imports updated

- [ ] **Pages**
  - [ ] BHCDashboard refactored
  - [ ] PatientsModule refactored
  - [ ] AddPatient refactored
  - [ ] Other pages refactored
  - [ ] All original functionality preserved

- [ ] **Testing**
  - [ ] Dashboard loads and displays data
  - [ ] Tables filter correctly
  - [ ] Pagination works
  - [ ] Forms submit
  - [ ] Error states display
  - [ ] Loading states show

## Common Migration Patterns

### Pattern 1: Simple Data Fetch & Display

```jsx
// Old
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchData()
    .then(setData)
    .finally(() => setLoading(false));
}, []);

// New
const { data, loading } = useFetch(() => fetchData(), []);
```

### Pattern 2: Table with Filters & Pagination

```jsx
// Old
const [filters, setFilters] = useState({});
const [page, setPage] = useState(1);
const filtered = useMemo(() => {
  return data.filter(...);
}, [data, filters]);
const paginated = filtered.slice((page-1)*10, page*10);

// New
const table = useDataTable(data, { itemsPerPage: 10 });
// Use: table.paginatedData, table.filters, table.currentPage
```

### Pattern 3: Form with Validation

```jsx
// Old
const [values, setValues] = useState({});
const [errors, setErrors] = useState({});
const handleChange = (e) => setValues({...});
const handleSubmit = async () => {
  const newErrors = validate(values);
  if (Object.keys(newErrors).length) return;
  await submit(values);
};

// New
const form = useForm(initialValues, submitFn, validators);
// Use: form.values, form.handleChange, form.errors, form.handleSubmit
```

### Pattern 4: Async Operations

```jsx
// Old
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
const execute = async (arg) => {
  try {
    setLoading(true);
    await operation(arg);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

// New
const { execute, loading, error } = useAsyncOperation(operation);
// Use: execute(arg), loading, error
```

## Performance Tips

1. **Memoize Expensive Computations**

   ```jsx
   const table = useDataTable(patients, { itemsPerPage: 10 });
   // Already memoized internally
   ```

2. **Use Service Caching**

   ```jsx
   const { data, refetch } = useFetch(() => getPatients(), []);
   // Refetch only when needed
   ```

3. **Lazy Load Components**

   ```jsx
   const PatientDetails = lazy(() => import("@/pages/bhc/PatientDetails"));
   ```

4. **Paginate Large Lists**
   ```jsx
   const table = useDataTable(data, { itemsPerPage: 10 });
   // Only renders current page
   ```

## Troubleshooting

### Issue: Component not updating after data change

**Solution:** Check if service is returning new data, not mutating old data.

```jsx
// ✅ Good - returns new array
return [...mockData];

// ❌ Bad - mutates original
mockData.push(newItem);
return mockData;
```

### Issue: Form validation not working

**Solution:** Ensure validators are functions that return error messages.

```jsx
// ✅ Good
validators: {
  email: (value) => (!value.includes("@") ? "Invalid email" : "");
}

// ❌ Bad
validators: {
  email: (value) => value.includes("@");
}
```

### Issue: Table not showing data

**Solution:** Check data format matches column keys.

```jsx
// ✅ Good
columns: [{ key: 'name', label: 'Name' }]
data: [{ name: 'John', ... }]

// ❌ Bad
columns: [{ key: 'name', label: 'Name' }]
data: [{ fullName: 'John', ... }]
```

### Issue: Too many re-renders

**Solution:** Check hook dependencies, use useCallback for handlers.

```jsx
// ✅ Good
const handleClick = useCallback(() => {
  /* ... */
}, []);

// ❌ Bad
const handleClick = () => {
  /* ... */
}; // New function each render
```

## Next Steps

1. **Run Tests** - Ensure all features work as before
2. **Performance Check** - Verify app performance hasn't degraded
3. **Code Review** - Have team members review changes
4. **Deploy** - Push to development environment for testing
5. **Monitor** - Watch for any issues post-deployment
6. **Iterate** - Refactor remaining pages progressively

## Additional Resources

- See `ARCHITECTURE.md` for detailed architecture guide
- Check component JSDoc for prop documentation
- Look at refactored example pages for patterns
- Review service files for API integration points

---

Happy refactoring! The new architecture will make your codebase more maintainable and scalable.
