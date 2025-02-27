/**
 * Enhanced Task Dependency Inference Demo
 * 
 * This example demonstrates the advanced task dependency inference system
 * that automatically detects relationships between tasks.
 */

import { DependencyInference } from '../src/planning/dependency-inference';
import { PlanTask } from '../src/planning/planner-interface';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

async function runDemo() {
  console.log('Enhanced Task Dependency Inference Demo');
  console.log('---------------------------------------\n');
  
  // Example complex tasks
  const complexTasks = [
    "Create a market analysis report for a new smartphone app",
    "Develop a comprehensive content strategy for a blog",
    "Plan and execute a website redesign project",
    "Organize a virtual conference for tech professionals"
  ];
  
  // Pick one of the complex tasks
  const selectedTask = complexTasks[Math.floor(Math.random() * complexTasks.length)];
  console.log('Complex task:', selectedTask);
  
  // Use predefined subtasks for the demo instead of generating them with an agent
  const taskDetails = getTasksForProject(selectedTask);
  
  console.log('\nSubtasks:');
  taskDetails.forEach((task, index) => {
    console.log(`${index + 1}. ${task}`);
  });
  
  // Create PlanTask objects for each task
  const tasks: PlanTask[] = taskDetails.map(taskDesc => ({
    id: uuidv4(),
    description: taskDesc,
    dependencies: [],
    status: 'pending'
  }));
  
  // Demo the dependency inference
  console.log('\nRunning dependency inference...');
  
  // Create the dependency inference system
  const dependencyInference = new DependencyInference({
    enableContentSimilarity: true,
    enableTypeHierarchy: true,
    enableInformationFlow: true
  });
  
  // Create a plan description based on the selected task
  const planDescription = getPlanDescriptionForTask(selectedTask);
  
  // Run inference on tasks
  const tasksWithDependencies = dependencyInference.inferDependencies(tasks, planDescription);
  
  // Visualize the dependency graph
  console.log('\nDependency Analysis Results:');
  console.log(dependencyInference.visualizeDependencyGraph(tasksWithDependencies));
  
  // Show statistics
  const totalDeps = tasksWithDependencies.reduce((sum, task) => sum + task.dependencies.length, 0);
  console.log(`\nStatistics:`);
  console.log(`- Total tasks: ${tasks.length}`);
  console.log(`- Total dependencies identified: ${totalDeps}`);
  console.log(`- Average dependencies per task: ${(totalDeps / tasks.length).toFixed(2)}`);
  
  // Create a detailed breakdown of the dependencies for display
  let depDescription = 'Task Dependencies:\n';
  
  for (const task of tasksWithDependencies) {
    if (task.dependencies.length > 0) {
      const depTasks = task.dependencies.map(depId => {
        const depTask = tasksWithDependencies.find(t => t.id === depId);
        return depTask ? depTask.description : 'Unknown task';
      });
      
      depDescription += `\n"${task.description}" depends on:\n`;
      depTasks.forEach(depTask => {
        depDescription += `- "${depTask}"\n`;
      });
    } else {
      depDescription += `\n"${task.description}" has no dependencies.\n`;
    }
  }
  
  console.log('\nDetailed Dependencies:');
  console.log(depDescription);
  
  console.log('\nDemo completed!');
}

// Helper function to get predefined tasks for a project
function getTasksForProject(projectName: string): string[] {
  // Define tasks for each project type
  const taskMap: Record<string, string[]> = {
    "Create a market analysis report for a new smartphone app": [
      "Research current market trends and user demographics for smartphone apps",
      "Analyze competitor features, pricing models, and user reviews",
      "Identify target audience segments and their specific needs",
      "Evaluate market size and growth potential for the app category",
      "Create positioning strategy based on market gaps and competitive advantages",
      "Conduct SWOT analysis for the proposed app concept",
      "Draft comprehensive market analysis report with findings and recommendations",
      "Create visual presentations and executive summary of market insights"
    ],
    "Develop a comprehensive content strategy for a blog": [
      "Research target audience demographics and content preferences",
      "Analyze competitor blogs and identify content gaps in the industry",
      "Define content pillars and topic clusters for the blog",
      "Create an editorial calendar with content themes and publishing schedule",
      "Develop style guide and tone of voice documentation",
      "Plan content distribution and promotion channels",
      "Establish KPIs and measurement framework for content performance",
      "Create templates for different content types and formats"
    ],
    "Plan and execute a website redesign project": [
      "Conduct user research and gather feedback on current website issues",
      "Perform competitive analysis of similar websites in the industry",
      "Create user personas and journey maps to guide the redesign",
      "Develop new information architecture and site navigation structure",
      "Create wireframes and prototypes for key page templates",
      "Design visual style guide including typography, colors and UI components",
      "Develop responsive layouts for desktop, tablet and mobile devices",
      "Plan and execute content migration from old to new website structure"
    ],
    "Organize a virtual conference for tech professionals": [
      "Define conference theme, goals and target audience",
      "Research and select appropriate virtual event platform",
      "Create sponsorship packages and secure partner organizations",
      "Develop programming schedule and session formats",
      "Recruit and coordinate speakers and moderators",
      "Create marketing plan and promotional materials",
      "Set up registration system and attendee communications",
      "Prepare technical support and contingency plans for the event day"
    ]
  };
  
  // Return tasks for the given project or empty array if not found
  return taskMap[projectName] || [];
}

// Helper function to get project descriptions with dependency hints
function getPlanDescriptionForTask(projectName: string): string {
  // Define detailed plan descriptions for each project type
  const planMap: Record<string, string> = {
    "Create a market analysis report for a new smartphone app": `
      To create a comprehensive market analysis report for a new smartphone app, we need to follow a structured approach.
      
      First, we'll start with thorough research of current market trends and user demographics to understand the landscape.
      At the same time, we should analyze competitor features, pricing models, and reviews to see what's already in the market.
      
      Once we have this initial research, we can identify the target audience segments and evaluate the market size.
      
      After gathering all this data, we'll need to create a positioning strategy based on the market gaps and competitive advantages we've identified.
      The SWOT analysis should be performed after we understand the market and competitors.
      
      With all analysis complete, we can draft the comprehensive report with our findings.
      Finally, we'll create visual presentations and an executive summary based on the full report.
    `,
    "Develop a comprehensive content strategy for a blog": `
      Creating a comprehensive content strategy requires several interconnected steps.
      
      We'll begin by researching the target audience demographics and content preferences to understand who we're serving.
      In parallel, we should analyze competitor blogs to identify content gaps that we can fill.
      
      Using the research findings, we'll define content pillars and topic clusters to organize our approach.
      Once we know what content we want to create, we can develop an editorial calendar with themes and a publishing schedule.
      
      The style guide and tone of voice documentation should be created after we understand our audience and content direction.
      
      After planning the content creation, we need to plan the distribution and promotion channels to reach our audience.
      Based on all previous work, we'll establish KPIs to measure performance.
      
      Finally, we can create templates for different content types based on our style guide and planned content types.
    `,
    "Plan and execute a website redesign project": `
      A successful website redesign follows a user-centered design process.
      
      We'll start by conducting user research and gathering feedback on the current website to identify pain points.
      At the same time, we should perform competitive analysis to see what works well in the industry.
      
      Based on the research, we'll create user personas and journey maps to guide our redesign decisions.
      With this understanding, we can develop a new information architecture and navigation structure.
      
      Once we have the structure, we'll create wireframes and prototypes for key page templates.
      After wireframing, we'll design the visual style guide including typography, colors, and UI components.
      
      Using both the wireframes and style guide, we'll develop responsive layouts for all device types.
      The final step is to plan and execute content migration from the old site to the new structure.
    `,
    "Organize a virtual conference for tech professionals": `
      Organizing a virtual conference involves several stages of planning and execution.
      
      We'll begin by defining the conference theme, goals, and target audience to set our direction.
      Based on our needs, we'll research and select an appropriate virtual event platform.
      
      Once we have the basic framework, we can create sponsorship packages and begin securing partners.
      In parallel, we should develop the programming schedule and session formats.
      
      After we know the program structure, we'll recruit and coordinate speakers and moderators.
      With the program and speakers confirmed, we can create the marketing plan and promotional materials.
      
      Next, we'll set up the registration system and plan attendee communications.
      Finally, we need to prepare technical support and contingency plans for the event day.
    `
  };
  
  // Return plan description for the given project or empty string if not found
  return planMap[projectName] || "";
}

// Run the demo
runDemo().catch(error => {
  console.error('Error running demo:', error);
});