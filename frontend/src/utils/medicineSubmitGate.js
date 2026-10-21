export function createSubmitGate() {
  let locked = false;

  return {
    begin() {
      if (locked) return false;
      locked = true;
      return true;
    },
    end() {
      locked = false;
    },
    get locked() {
      return locked;
    },
  };
}
