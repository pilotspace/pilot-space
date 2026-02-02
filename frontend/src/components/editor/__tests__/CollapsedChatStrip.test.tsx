/**
 * Unit tests for CollapsedChatStrip component.
 *
 * Tests rendering, click callback, text display, and keyboard shortcut hint.
 *
 * @module components/editor/__tests__/CollapsedChatStrip.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsedChatStrip } from '../CollapsedChatStrip';

describe('CollapsedChatStrip', () => {
  it('test_renders_desktop_strip — renders desktop vertical strip with PilotSpace Agent text', () => {
    render(<CollapsedChatStrip onClick={vi.fn()} />);
    const strip = screen.getByTestId('collapsed-chat-strip');
    expect(strip).toBeInTheDocument();
    // Text appears in both desktop and mobile strips
    expect(screen.getAllByText('PilotSpace Agent').length).toBeGreaterThanOrEqual(1);
  });

  it('test_renders_mobile_strip — renders mobile horizontal bar', () => {
    render(<CollapsedChatStrip onClick={vi.fn()} />);
    const mobileStrip = screen.getByTestId('collapsed-chat-strip-mobile');
    expect(mobileStrip).toBeInTheDocument();
  });

  it('test_desktop_click — calls onClick when desktop strip is clicked', () => {
    const onClick = vi.fn();
    render(<CollapsedChatStrip onClick={onClick} />);

    fireEvent.click(screen.getByTestId('collapsed-chat-strip'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('test_mobile_click — calls onClick when mobile bar is clicked', () => {
    const onClick = vi.fn();
    render(<CollapsedChatStrip onClick={onClick} />);

    fireEvent.click(screen.getByTestId('collapsed-chat-strip-mobile'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('test_keyboard_shortcut_hint — shows keyboard shortcut', () => {
    render(<CollapsedChatStrip onClick={vi.fn()} />);
    expect(screen.getByText('⌘⇧P')).toBeInTheDocument();
  });

  it('test_custom_classname — applies additional className', () => {
    const { container } = render(<CollapsedChatStrip onClick={vi.fn()} className="my-custom" />);
    const desktopStrip = container.querySelector('.my-custom');
    expect(desktopStrip).toBeInTheDocument();
  });
});
