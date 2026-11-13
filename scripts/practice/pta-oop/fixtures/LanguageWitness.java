interface Task { void run(); }
class Parent {
    protected int value = 7;
    public int read() { return value; }
}
class Child extends Parent {
    int inherited() { return this.value + this.read(); }
}
class TaskProvider { public void run() {} }
class InheritedTask extends TaskProvider implements Task {}
interface DefaultTask { default int value() { return 9; } }
class UnchangedDefault implements DefaultTask {}
abstract class AbstractTask implements Task {}
abstract class StillAbstract implements Task { public void run() {} }

public class LanguageWitness {
    int value = 20;
    int locals() { final int value = 3; return value + this.value; }
    public static void main(String[] args) {
        if (new Child().inherited() != 14) throw new AssertionError("this inherits accessible members");
        new InheritedTask().run();
        if (new UnchangedDefault().value() != 9) throw new AssertionError("default methods need no override");
        new StillAbstract() {}.run();
        if (new LanguageWitness().locals() != 23) throw new AssertionError("final local variables can shadow fields");
        System.out.println("this, inherited interfaces, default methods, abstract classes and final locals verified");
    }
}
