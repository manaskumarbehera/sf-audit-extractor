// SOQL schema helper stub: disable schema lookups while preserving API surface.
export const Soql_helper_schema = (function(){
  async function initSchema(useTooling = false){ return []; }
  async function describeSObject(name, useTooling = false){ return null; }
  function getObjects(useTooling = false){ return []; }
  function getLastDescribeGlobalResponse(){ return null; }
  async function isQueryable(name, useTooling = false){ return false; }
  return { initSchema, describeSObject, getObjects, getLastDescribeGlobalResponse, isQueryable };
})();
