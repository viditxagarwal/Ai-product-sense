Here's what I need from you to systematically close every gap:                                                                                           
                                                                                                                                                           
  1. Scope Decision (you must decide)                                                                                                                      
                                                                                                                                                           
  The spec has 10 phases. Some are massive new features (Postman, alerting, test harness). Others are wiring existing code properly. I need you to tell me:
                                                                                                                                                           
  Which tier do you want done NOW vs LATER?                                                                                                                
                                                                                                                                                         
  Tier 1 — Wire what exists (quick wins, ~1-2 sessions)
  - Fix the 10+ config values that are saved but ignored at runtime (top_p, parallel_tool_calls, tool_max_iterations, buffer_size_messages, etc.)
  - Persist Layer 4 fields to execution_runs table (workflow_id, config_snapshot, path_taken, total_llm_calls, etc.)                                       
  - Add thinking_enabled, thinking_budget_tokens, reasoning_effort to config + wire to LLM API                      
  - Add missing models (o3, o3-mini, o4-mini) to available-models dropdown                                                                                 
  - Wire the 15 display settings toggles that currently do nothing                                                                                         
  - Add stop_sequences, json_schema config fields                                                                                                          
  - Emit the missing Layer 5 stream fields (progress_pct, cost_so_far, elapsed_ms, etc.)                                                                   
                                                                                                                                                           
  Tier 2 — Core architecture gaps (~2-3 sessions)                                                                                                          
  - Runtime conditional routing — Make the executor actually evaluate edge conditions (all 5 levels). This is a fundamental rewrite of the executor's      
  traversal logic from linear to graph-based.                                                                                                              
  - Runtime loop execution — Back-edges, iteration counting, exit conditions                                                                               
  - Runtime split/merge — Parallel branch fan-out, merge strategies                                                                                        
  - Runtime mapping layer — Evaluate inputOutputMapping transforms between nodes                                                                           
  - Missing event types — Emit all 10 missing event types (edge_evaluated, split_*, human_review_*, etc.)                                                  
  - Gate nodes — Real human-in-the-loop with WS approve/reject                                                                                             
                                                                                                                                                           
  Tier 3 — New features (~3-5 sessions)                                                                                                                    
  - Postman integration                                                                                                                                    
  - Test This Step                                                                                                                                         
  - Comparison View entry point + output/config diff                                                                                                     
  - Activity Log, Live Tool Cards, Status Line, Token Heatmap components                                                                                   
  - Path Highlight on Canvas, Loop Counter Overlay                                                                                                         
  - SSE endpoint (alongside existing WebSocket)                                                                                                            
  - Export & Replay                                                                                                                                        
  - Alerting & Thresholds                                                                                                                                  
                                                                                                                                                           
  2. Naming Conflicts (you must decide)                                                                                                                  
                                                                                                                                                           
  The spec and codebase use different enum values for the same settings. Pick one:                                                                         
                                                                                                                                                           
  ┌─────────────────────────────┬─────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────┐   
  │           Setting           │                      Current Codebase                       │                       Spec Says                        │ 
  ├─────────────────────────────┼─────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
  │ streaming_mode              │ token_by_token, chunk_by_section, structured_blocks,        │ off, text_only, text_and_thinking, text_and_tools,     │
  │                             │ complete_then_render                                        │ full                                                   │
  ├─────────────────────────────┼─────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤   
  │ chain_of_thought_visibility │ always_show, always_hide, auto, user_toggleable             │ hidden, collapsed, expanded                            │
  ├─────────────────────────────┼─────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤   
  │ memory_strategy             │ buffer, buffer_window, summary, token_buffer, vector_store, │ none, full_history, sliding_window, summary,           │ 
  │                             │  combined                                                   │ rag_memory, structured                                 │   
  ├─────────────────────────────┼─────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤ 
  │ output_format               │ markdown, structured_json, html, auto_detect                │ freetext, markdown, structured_json, table,            │   
  │                             │                                                             │ custom_template                                        │   
  └─────────────────────────────┴─────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
                                                                                                                                                           
  Options: (A) Migrate to spec values, (B) Keep current values, (C) Merge both sets. I need your call — this affects DB migrations and all existing        
  configurations.
                                                                                                                                                           
  3. DB Migration Comfort Level                                                                                                                          

  Closing these gaps requires adding columns to execution_runs, execution_steps, and configurations. This means:                                           
  
  - SQL migrations against your Supabase instance                                                                                                          
  - Existing data won't have the new columns populated (nulls)                                                                                           
  - Configurations are immutable, so old configs won't have new fields                                                                                     
                                                                                                                                                           
  Are you okay with me writing and running these migrations?                                                                                               
                                                                                                                                                           
  4. Nothing Else                                                                                                                                          
                                                                                                                                                         
  That's it. Give me:
  1. Which tier(s) to do now
  2. Spec values or current values for the naming conflicts                                                                                                
  3. Green light on DB migrations                          
                                                                                                                                                           
  Then I'll execute systematically — one phase at a time, committing after each, no circling back.                                                       
                                                                                                       