// Storage stub for SOQL recent queries — keep API but disable persistence.
export const Soql_helper_storage = (function(){
  async function saveQuery(query){ /* no-op */ }
  async function loadRecent(){ return []; }
  return { saveQuery, loadRecent };
})();
