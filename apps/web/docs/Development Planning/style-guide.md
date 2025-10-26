# Style Guide

## Color Palette

### Primary Colors

- **Dark Green**: `hsl(142, 76%, 36%)` - Used for primary elements, links, and focus states
- **Light Green**: `hsl(142, 76%, 60%)` - Used for secondary elements, H2 headers, and bullets
- **White**: `hsl(0, 0%, 100%)` - Primary text color for maximum readability
- **Off-Black**: `hsl(0, 0%, 8%)` - Background color with subtle variations

### Supporting Colors

- **Muted Background**: `hsl(0, 0%, 15%)` - For cards and subtle backgrounds
- **Border Color**: `hsl(0, 0%, 20%)` - For borders and dividers
- **Muted Text**: `hsl(0, 0%, 70%)` - For secondary text and captions

## Typography

### Headers

- **H1**: Large, bold, white text with dark green bottom border
- **H2**: Large, bold, light green text
- **H3**: Medium, semibold, white text
- **H4**: Small, semibold, light green text

### Body Text

- **Paragraphs**: White text with relaxed line height for readability
- **Strong/Bold**: Bold weight without color (maintains readability)
- **Links**: Dark green with light green hover state

## Components

### Buttons

- **Primary**: Dark green background with white text
- **Secondary**: Light green background with white text
- **Ghost**: Transparent with hover states

### Cards

- **Background**: Slightly lighter off-black for visual separation
- **Padding**: Generous padding for comfortable reading
- **Borders**: Subtle borders for definition

### Navigation

- **Sidebar**: Dark background with light green accents
- **Active States**: Primary button styling for current page
- **Hover States**: Smooth transitions with light green highlights

## Lists and Bullets

### Bullet Points

- **Primary Bullets**: Light green color
- **Nested Bullets**: Consistent light green throughout all levels
- **Spacing**: Generous spacing between items for readability

### Numbered Lists

- **Numbers**: Light green color matching bullet points
- **Indentation**: Progressive indentation for nested lists

## Layout

### Spacing

- **Margins**: Consistent spacing between sections
- **Padding**: Generous padding for comfortable reading
- **Line Height**: Relaxed line height for better readability

### Visual Hierarchy

- **Clear Distinction**: H1/H3 in white, H2/H4 in light green
- **Consistent Styling**: All list markers in light green
- **Clean Emphasis**: Bold text without color distraction

## Interactive Elements

### Links

- **Default State**: Dark green color
- **Hover State**: Light green with smooth transition
- **Focus State**: Dark green with focus ring

### Navigation

- **Tab Bar**: Sticky positioning with backdrop blur
- **Active Tab**: Primary button styling
- **Inactive Tabs**: Ghost button styling

## Code and Technical Elements

### Code Blocks

- **Background**: Muted background with subtle transparency
- **Borders**: Subtle borders for definition
- **Text**: Monospace font with proper contrast

### Tables

- **Headers**: Muted background with bold text
- **Borders**: Consistent border styling
- **Spacing**: Adequate padding for readability

## Accessibility

### Contrast

- **High Contrast**: White text on off-black backgrounds
- **Color Hierarchy**: Clear distinction between text levels
- **Focus States**: Visible focus indicators

### Readability

- **Font Sizes**: Appropriate sizing for all screen sizes
- **Line Height**: Relaxed spacing for comfortable reading
- **Spacing**: Generous margins and padding

## Responsive Design

### Mobile

- **Navigation**: Horizontal scrolling for tab navigation
- **Typography**: Scalable font sizes
- **Spacing**: Adjusted padding for smaller screens

### Desktop

- **Layout**: Full-width layout with maximum content width
- **Navigation**: Full sidebar with all navigation options
- **Typography**: Optimal sizing for desktop reading

## Usage Guidelines

### Do's

- Use the established color palette consistently
- Maintain generous spacing for readability
- Use light green for secondary elements and bullets
- Keep white text for primary content

### Don'ts

- Don't use colors outside the established palette
- Don't use yellow or gold colors (removed from design)
- Don't color strong/bold text (keep it just bold)
- Don't use low contrast combinations

## Implementation

This style guide is implemented using:

- **Tailwind CSS**: For utility classes and responsive design
- **CSS Custom Properties**: For consistent color values
- **Component Library**: ShadCN UI components with custom styling
- **Responsive Design**: Mobile-first approach with desktop enhancements
