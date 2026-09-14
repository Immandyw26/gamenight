import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rfjvoaoqgahjkyuyavso.supabase.co';

const supabaseKey = 'sb_publishable_oRWvw5E6qp_Nxk7JJxcNKQ_UOQi5sMl';

export const supabase = createClient(supabaseUrl, supabaseKey);