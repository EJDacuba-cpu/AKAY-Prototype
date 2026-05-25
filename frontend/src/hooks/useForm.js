/**
 * useForm Hook - Handle form state and validation
 * @hook
 *
 * @param {object} initialValues - Initial form values
 * @param {Function} onSubmit - Submit handler
 * @param {object} [validators={}] - Field validators { fieldName: (value) => errorMessage }
 *
 * @returns {Object} { values, setValues, errors, setErrors, handleChange, handleSubmit, reset, isValid }
 *
 * @example
 * const form = useForm(
 *   { name: '', email: '' },
 *   (values) => createPatient(values),
 *   { email: (v) => !v.includes('@') ? 'Invalid email' : '' }
 * );
 */
import { useState, useCallback } from "react";

export default function useForm(initialValues, onSubmit, validators = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = useCallback(() => {
    const newErrors = {};

    for (const [field, validator] of Object.entries(validators)) {
      if (validator) {
        const error = validator(values[field]);
        if (error) {
          newErrors[field] = error;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, validators]);

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();

      if (!validate()) return;

      try {
        setIsSubmitting(true);
        await onSubmit?.(values);
      } catch (error) {
        console.error("Form submission error:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, validate, onSubmit],
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  return {
    values,
    setValues,
    errors,
    setErrors,
    handleChange,
    handleSubmit,
    reset,
    isSubmitting,
    isValid: Object.keys(errors).length === 0,
  };
}
