import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getHouseholds } from '../services/householdService';

// Household lookup for choosing an existing household (same call as patient registration).
export default function useHouseholdSearch(scope) {
  const client=useQueryClient();
  const request=useRef(0);
  const [results,setResults]=useState([]);
  const [state,setState]=useState({loading:false,error:''});
  async function search(value) {
    const seq=++request.current;
    setState({loading:true,error:''});setResults([]);
    try {
      const page=await client.fetchQuery({queryKey:[...scope.key,'lookup',value],queryFn:()=>getHouseholds({lookup:true,search:value,per_page:100}),staleTime:0});
      if(seq !== request.current) return;
      setResults(page.items);setState({loading:false,error:''});
    } catch(error) {if(seq === request.current) setState({loading:false,error:error.message || 'Unable to search households.'});}
  }
  return {results,search,loading:state.loading,error:state.error};
}
