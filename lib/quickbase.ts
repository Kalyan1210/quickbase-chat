import axios, { AxiosInstance } from 'axios';

// ═══════════════════════════════════════════════════════════════════════════════
// QUICKBASE API CLIENT
// Handles all interactions with QuickBase REST API
// ═══════════════════════════════════════════════════════════════════════════════

export interface QuickBaseConfig {
  realm: string;
  userToken: string;
}

export interface QuickBaseField {
  id: number;
  label: string;
  fieldType: string;
  required: boolean;
}

export interface QuickBaseTable {
  id: string;
  name: string;
  description?: string;
  fields?: QuickBaseField[];
}

export interface QuickBaseRecord {
  [key: string]: { value: unknown };
}

export interface QueryResult {
  data: QuickBaseRecord[];
  fields: { id: number; label: string; type: string }[];
  metadata: {
    totalRecords: number;
    numRecords: number;
    skip: number;
  };
}

export class QuickBaseClient {
  private client: AxiosInstance;
  private realm: string;
  private appId: string;

  constructor(config: QuickBaseConfig) {
    this.realm = config.realm;
    this.appId = process.env.QUICKBASE_APP_ID || '';
    
    this.client = axios.create({
      baseURL: `https://api.quickbase.com/v1`,
      headers: {
        'QB-Realm-Hostname': `${config.realm}.quickbase.com`,
        'Authorization': `QB-USER-TOKEN ${config.userToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get all tables in the application
   */
  async getTables(): Promise<QuickBaseTable[]> {
    try {
      const response = await this.client.get(`/tables?appId=${this.appId}`);
      return response.data.map((table: { id: string; name: string; description?: string }) => ({
        id: table.id,
        name: table.name,
        description: table.description,
      }));
    } catch (error) {
      console.error('Error fetching tables:', error);
      throw new Error('Failed to fetch QuickBase tables');
    }
  }

  /**
   * Get fields for a specific table
   */
  async getTableFields(tableId: string): Promise<QuickBaseField[]> {
    try {
      const response = await this.client.get(`/fields?tableId=${tableId}`);
      return response.data.map((field: { id: number; label: string; fieldType: string; required: boolean }) => ({
        id: field.id,
        label: field.label,
        fieldType: field.fieldType,
        required: field.required,
      }));
    } catch (error) {
      console.error('Error fetching fields:', error);
      throw new Error('Failed to fetch table fields');
    }
  }

  /**
   * Get the schema of all tables and their fields
   * This is used by the AI to understand the data structure
   */
  async getAppSchema(): Promise<QuickBaseTable[]> {
    const tables = await this.getTables();
    
    // Fetch fields for each table
    const tablesWithFields = await Promise.all(
      tables.map(async (table) => {
        const fields = await this.getTableFields(table.id);
        return { ...table, fields };
      })
    );
    
    return tablesWithFields;
  }

  /**
   * Query records from a table
   */
  async queryRecords(
    tableId: string,
    options: {
      select?: number[];
      where?: string;
      sortBy?: { fieldId: number; order: 'ASC' | 'DESC' }[];
      groupBy?: { fieldId: number }[];
      top?: number;
      skip?: number;
    } = {}
  ): Promise<QueryResult> {
    try {
      const body: {
        from: string;
        select?: number[];
        where?: string;
        sortBy?: { fieldId: number; order: 'ASC' | 'DESC' }[];
        groupBy?: { fieldId: number }[];
        options?: { top?: number; skip?: number };
      } = {
        from: tableId,
      };

      if (options.select) body.select = options.select;
      if (options.where) body.where = options.where;
      if (options.sortBy) body.sortBy = options.sortBy;
      if (options.groupBy) body.groupBy = options.groupBy;
      if (options.top || options.skip) {
        body.options = {};
        if (options.top) body.options.top = options.top;
        if (options.skip) body.options.skip = options.skip;
      }

      const response = await this.client.post('/records/query', body);

      return {
        data: response.data.data,
        fields: response.data.fields,
        metadata: response.data.metadata,
      };
    } catch (error) {
      console.error('Error querying records:', error);
      throw new Error('Failed to query QuickBase records');
    }
  }

  /**
   * Get a summary/count of records
   */
  async getRecordCount(tableId: string, where?: string): Promise<number> {
    try {
      const body: { from: string; select: number[]; where?: string } = {
        from: tableId,
        select: [3], // Record ID field
      };
      if (where) body.where = where;

      console.log('[QB DEBUG] getRecordCount:', JSON.stringify({ tableId, where, body }));
      const response = await this.client.post('/records/query', body);
      console.log('[QB DEBUG] getRecordCount result:', response.data.metadata.totalRecords);
      return response.data.metadata.totalRecords;
    } catch (error) {
      console.error('Error counting records:', error);
      throw new Error('Failed to count records');
    }
  }

  /**
   * Run a report
   */
  async runReport(tableId: string, reportId: string, skip = 0, top = 100): Promise<QueryResult> {
    try {
      const response = await this.client.post(`/reports/${reportId}/run?tableId=${tableId}`, {
        skip,
        top,
      });

      return {
        data: response.data.data,
        fields: response.data.fields,
        metadata: response.data.metadata,
      };
    } catch (error) {
      console.error('Error running report:', error);
      throw new Error('Failed to run report');
    }
  }

  /**
   * Get reports for a table
   */
  async getReports(tableId: string): Promise<{ id: string; name: string; description?: string }[]> {
    try {
      const response = await this.client.get(`/reports?tableId=${tableId}`);
      return response.data.map((report: { id: string; name: string; description?: string }) => ({
        id: report.id,
        name: report.name,
        description: report.description,
      }));
    } catch (error) {
      console.error('Error fetching reports:', error);
      throw new Error('Failed to fetch reports');
    }
  }
}

/**
 * Create a QuickBase client with user's token
 */
export function createQuickBaseClient(userToken: string): QuickBaseClient {
  const realm = process.env.QUICKBASE_REALM;
  
  if (!realm) {
    throw new Error('QUICKBASE_REALM environment variable is not set');
  }

  return new QuickBaseClient({
    realm,
    userToken,
  });
}

/**
 * Create a QuickBase client with the system token (for schema discovery)
 */
export function createSystemQuickBaseClient(): QuickBaseClient {
  const realm = process.env.QUICKBASE_REALM;
  const userToken = process.env.QUICKBASE_USER_TOKEN;
  
  if (!realm || !userToken) {
    throw new Error('QUICKBASE_REALM or QUICKBASE_USER_TOKEN environment variable is not set');
  }

  return new QuickBaseClient({
    realm,
    userToken,
  });
}

